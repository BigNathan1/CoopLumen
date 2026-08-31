# Backlog tooling

`issue.md` at the repo root is the source of truth for the 500-item build-out backlog: a checkbox list, grouped by phase and category, each item numbered `#001`–`#500`. It is intentionally gitignored — see its own header note — so it can be freely regenerated without touching history.

This directory turns that backlog into two things: a richer local `issue.md` (Summary / Context / Acceptance Criteria per item, still scannable via collapsed `<details>`), and real GitHub issues.

## Files

- **`parse.js`** — parses `issue.md`'s checkbox lines into `{ number, done, labels, title, phase, category }` records. Every other script starts here.
- **`context.js`** — the shared, hand-written narrative: one blurb per phase, one per category, and per-label acceptance-criteria bullets. This is where the actual "quality" content lives; everything else is templating around it.
- **`render.js`** — turns one parsed item into a GitHub-issue title and body.
- **`generate-issue-md.js`** — regenerates `issue.md` in place from itself. Safe to re-run any time after checking a box or editing a title/label in the file; it re-parses its own prior output, so it's idempotent (verified: two consecutive runs produce a byte-identical file).
- **`push-to-github.js`** — creates real GitHub issues for a number range via the `gh` CLI. Idempotent via `pushed.json` (backlog number → GitHub issue), so a crash mid-run (this has happened once, to a transient network blip) is safe to just re-run.
- **`pushed.json`** — the number-range mapping `push-to-github.js` maintains. Not gitignored on purpose — it's small and worth keeping so nobody re-derives "what's already on GitHub" by hand.

## Usage

```bash
# After editing issue.md by hand (check a box, tweak a title/label):
node scripts/issues/generate-issue-md.js

# Preview what would be pushed without creating anything:
node scripts/issues/push-to-github.js --from 101 --to 200 --dry-run

# Push the next batch for real:
node scripts/issues/push-to-github.js --from 101 --to 200
```

## Why a generator instead of 500 hand-written issues

Every item already had an accurate, repo-specific one-liner (file paths, endpoint names, table names). Hand-writing a full Summary/Context/Acceptance-Criteria block for each of 500 would either take an impractical amount of time or degrade into repetitive filler somewhere around item 50. Writing the category/phase context once in `context.js` and combining it with each item's existing one-liner gets every issue real, accurate background without either problem — and it means fixing a category's context (or its acceptance-criteria bullets) is a one-line edit that propagates to every issue in that category on the next regenerate/push, rather than 20+ manual edits.

## Numbering caveat

GitHub assigns its own issue numbers on creation. `push-to-github.js` prefixes every title with `[#NNN]` (the backlog number) specifically so the stable, repo-internal number survives even if GitHub's numbering ever drifts from it (e.g. if a PR is opened against the repo before the whole backlog is pushed, consuming a number). Don't assume GitHub issue #52 is backlog item #052 without checking `pushed.json` — check that file, not the title, if you need certainty.
