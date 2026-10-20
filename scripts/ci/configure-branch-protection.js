#!/usr/bin/env node
'use strict';

/**
 * Configure or verify GitHub branch protection for CoopLumen.
 *
 * Enforces:
 * - Status check: "Quality gate" must pass
 * - Strict up-to-date branch requirement (strict: true)
 * - Required approving reviews: at least 1
 * - Dismiss stale reviews on new pushes
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getBranchProtectionPayload() {
  return {
    required_status_checks: {
      strict: true,
      contexts: ['Quality gate'],
    },
    enforce_admins: false,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      required_approving_review_count: 1,
    },
    restrictions: null,
  };
}

function detectRepo() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }
  try {
    const remotes = ['origin', 'upstream'];
    for (const remote of remotes) {
      try {
        const url = execSync(`git remote get-url ${remote}`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
        }).trim();
        const match = url.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
        if (match) {
          return match[1];
        }
      } catch {
        // try next remote
      }
    }
  } catch {
    // fallback
  }
  return 'BigNathan1/CoopLumen';
}

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    repo: detectRepo(),
    branch: 'main',
    dryRun: false,
    verifyOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--repo' && args[i + 1]) {
      options.repo = args[++i];
    } else if (arg === '--branch' && args[i + 1]) {
      options.branch = args[++i];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verify') {
      options.verifyOnly = true;
    }
  }

  return options;
}

function configureBranchProtection(options) {
  const payload = getBranchProtectionPayload();

  if (options.dryRun) {
    console.log('Dry run - configuration payload:');
    console.log(JSON.stringify(payload, null, 2));
    return { success: true, dryRun: true, payload };
  }

  const tmpFile = path.join(__dirname, `.bp-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2));

  try {
    const endpoint = `repos/${options.repo}/branches/${options.branch}/protection`;
    console.log(`Applying branch protection on ${endpoint}...`);
    const output = execSync(`gh api -X PUT ${endpoint} --input "${tmpFile}"`, {
      encoding: 'utf8',
    });
    console.log(`Branch protection successfully applied to ${options.repo}:${options.branch}`);
    return { success: true, data: JSON.parse(output) };
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}

function verifyBranchProtection(options) {
  const endpoint = `repos/${options.repo}/branches/${options.branch}/protection`;
  console.log(`Verifying branch protection on ${endpoint}...`);
  try {
    const output = execSync(`gh api ${endpoint}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const data = JSON.parse(output);

    const checks = data.required_status_checks?.contexts || [];
    const hasQualityGate = checks.includes('Quality gate');
    const isStrict = Boolean(data.required_status_checks?.strict);
    const reviews = data.required_pull_request_reviews?.required_approving_review_count || 0;
    const hasApproval = reviews >= 1;

    console.log(`Status check 'Quality gate': ${hasQualityGate ? 'PASS' : 'FAIL'}`);
    console.log(`Strict up-to-date required: ${isStrict ? 'PASS' : 'FAIL'}`);
    console.log(`Approving reviews required (>= 1): ${hasApproval ? `PASS (${reviews})` : 'FAIL'}`);

    const valid = hasQualityGate && isStrict && hasApproval;
    return { valid, data, checks, isStrict, reviews };
  } catch (err) {
    console.error(`Failed to verify branch protection: ${err.message}`);
    return { valid: false, error: err.message };
  }
}

function main() {
  const options = parseArgs();
  if (options.verifyOnly) {
    const result = verifyBranchProtection(options);
    process.exit(result.valid ? 0 : 1);
  } else {
    configureBranchProtection(options);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = {
  getBranchProtectionPayload,
  detectRepo,
  parseArgs,
  configureBranchProtection,
  verifyBranchProtection,
};
