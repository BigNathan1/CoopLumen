'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getBranchProtectionPayload, parseArgs } = require('../configure-branch-protection.js');

test('getBranchProtectionPayload returns expected required status checks and reviews', () => {
  const payload = getBranchProtectionPayload();

  assert.equal(payload.required_status_checks.strict, true);
  assert.deepEqual(payload.required_status_checks.contexts, ['Quality gate']);
  assert.equal(payload.enforce_admins, false);
  assert.equal(payload.required_pull_request_reviews.required_approving_review_count, 1);
  assert.equal(payload.required_pull_request_reviews.dismiss_stale_reviews, true);
  assert.equal(payload.required_pull_request_reviews.require_code_owner_reviews, true);
  assert.equal(payload.required_pull_request_reviews.require_last_push_approval, true);
  assert.equal(payload.allow_force_pushes, false);
  assert.equal(payload.allow_deletions, false);
  assert.equal(payload.restrictions, null);
});

test('parseArgs parses custom flags correctly', () => {
  const options = parseArgs([
    '--repo',
    'custom/repo',
    '--branch',
    'develop',
    '--dry-run',
    '--verify',
  ]);

  assert.equal(options.repo, 'custom/repo');
  assert.equal(options.branch, 'develop');
  assert.equal(options.dryRun, true);
  assert.equal(options.verifyOnly, true);
});

test('parseArgs provides default branch as main', () => {
  const options = parseArgs([]);
  assert.equal(options.branch, 'main');
  assert.equal(options.dryRun, false);
  assert.equal(options.verifyOnly, false);
});
