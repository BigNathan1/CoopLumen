'use strict';

/**
 * Pushes backlog items from issue.md to GitHub as real issues, using the
 * `gh` CLI (must already be authenticated — this script shells out to it
 * rather than re-implementing GitHub API auth).
 *
 * - Creates any backlog label that doesn't yet exist on the repo.
 * - Creates one GitHub issue per backlog item, titled `[#NNN] <title>` so the
 *   stable backlog number survives even though GitHub assigns its own issue
 *   number on creation (which will only coincidentally match).
 * - An item already marked `[x]` (done) in issue.md is created and then
 *   immediately closed with an explanatory comment, so the public tracker
 *   reflects reality instead of showing 25 "open" issues for finished work.
 * - Idempotent: records backlog-number -> GitHub issue in pushed.json and
 *   skips anything already recorded, so a re-run (or a crash partway
 *   through) never double-creates issues.
 *
 * Usage:
 *   node scripts/issues/push-to-github.js --from 1 --to 100 [--dry-run] [--repo owner/name]
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { parseBacklog } = require('./parse');
const { renderTitle, renderBody } = require('./render');

const ISSUE_MD = path.join(__dirname, '..', '..', 'issue.md');
const PUSHED_JSON = path.join(__dirname, 'pushed.json');

const ALL_LABELS = {
  infra: '5319e7',
  db: '0e8a16',
  backend: '1d76db',
  frontend: 'fbca04',
  stellar: '000075',
  auth: 'b60205',
  test: 'c5def5',
  'e2e': 'bfd4f2',
  'ci/cd': '0052cc',
  security: 'd93f0b',
  'phase-2': 'e99695',
  'phase-3': 'f9d0c4',
  'phase-4': 'fef2c0',
  perf: '006b75',
  docs: '0075ca',
  'good-first-issue': '7057ff',
};

function parseArgs(argv) {
  const args = { from: 1, to: 100, dryRun: false, repo: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') args.from = Number(argv[++i]);
    else if (argv[i] === '--to') args.to = Number(argv[++i]);
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--repo') args.repo = argv[++i];
  }
  return args;
}

function gh(args, opts = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', ...opts });
}

function detectRepo() {
  const out = gh(['repo', 'view', '--json', 'nameWithOwner']);
  return JSON.parse(out).nameWithOwner;
}

function existingLabels(repo) {
  const out = gh(['label', 'list', '--repo', repo, '--limit', '200', '--json', 'name']);
  return new Set(JSON.parse(out).map((l) => l.name));
}

function ensureLabels(repo, dryRun) {
  const have = dryRun ? new Set() : existingLabels(repo);
  for (const [name, color] of Object.entries(ALL_LABELS)) {
    if (have.has(name)) continue;
    console.log(`  label: creating "${name}"`);
    if (dryRun) continue;
    try {
      gh(['label', 'create', name, '--repo', repo, '--color', color, '--force']);
    } catch (err) {
      console.warn(`  label: could not create "${name}": ${err.message.split('\n')[0]}`);
    }
  }
}

function loadPushed() {
  if (!fs.existsSync(PUSHED_JSON)) return {};
  return JSON.parse(fs.readFileSync(PUSHED_JSON, 'utf8'));
}

function savePushed(pushed) {
  fs.writeFileSync(PUSHED_JSON, JSON.stringify(pushed, null, 2) + '\n');
}

function sleep(ms) {
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = args.repo ?? detectRepo();
  console.log(`Target repo: ${repo} (issues ${args.from}-${args.to}, dry-run: ${args.dryRun})`);

  const items = parseBacklog(ISSUE_MD).filter(
    (i) => i.number >= args.from && i.number <= args.to
  );
  if (items.length === 0) {
    console.log('No matching backlog items in that range.');
    return;
  }

  console.log(`Ensuring ${Object.keys(ALL_LABELS).length} backlog labels exist...`);
  ensureLabels(repo, args.dryRun);

  const pushed = loadPushed();
  let created = 0;
  let skipped = 0;

  for (const issue of items) {
    const key = String(issue.number);
    if (pushed[key]) {
      skipped++;
      continue;
    }

    const title = renderTitle(issue);
    const body = renderBody(issue);
    console.log(`#${key.padStart(3, '0')} ${issue.done ? '(done)' : '(open)'} — ${issue.title}`);

    if (args.dryRun) {
      created++;
      continue;
    }

    const bodyFile = path.join(__dirname, `.tmp-body-${issue.number}.md`);
    fs.writeFileSync(bodyFile, body);
    try {
      const labelArgs = issue.labels.flatMap((l) => ['--label', l]);
      const url = gh([
        'issue',
        'create',
        '--repo',
        repo,
        '--title',
        title,
        '--body-file',
        bodyFile,
        ...labelArgs,
      ]).trim();
      const ghNumber = Number(url.split('/').pop());

      if (issue.done) {
        gh([
          'issue',
          'close',
          String(ghNumber),
          '--repo',
          repo,
          '--comment',
          'Already completed in earlier project history — closing to keep the public tracker accurate.',
        ]);
      }

      pushed[key] = { url, ghNumber, done: issue.done };
      savePushed(pushed);
      created++;
    } finally {
      fs.unlinkSync(bodyFile);
    }

    sleep(300); // be polite to the API
  }

  console.log(`\nDone. Created ${created}, skipped ${skipped} already-pushed.`);
}

main();
