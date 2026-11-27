#!/usr/bin/env node
'use strict';

/**
 * Checks docs/openapi.yaml for the structural mistakes merges keep introducing:
 * duplicate keys, a path sitting at the top level instead of under `paths`,
 * unexpected top-level keys, and `$ref`s that point at nothing.
 *
 * It uses the `yaml` package's own parser rather than a full OpenAPI
 * validator, so it runs with no extra dependency.
 *
 * Usage: node scripts/ci/check-openapi.js [path]   (exit 1 when a problem is found)
 */

const fs = require('node:fs');
const path = require('node:path');

const ALLOWED_TOP_LEVEL = new Set([
  'openapi',
  'info',
  'servers',
  'tags',
  'paths',
  'components',
  'security',
  'externalDocs',
  'webhooks',
]);

function loadYaml() {
  // A root devDependency; resolved from the root install wherever the script runs.
  return require(
    require.resolve('yaml', { paths: [process.cwd(), path.join(__dirname, '../..')] })
  );
}

function collectRefs(node, refs = []) {
  if (Array.isArray(node)) node.forEach((item) => collectRefs(item, refs));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') refs.push(value);
      else collectRefs(value, refs);
    }
  }
  return refs;
}

function resolvePointer(root, ref) {
  if (!ref.startsWith('#/')) return true; // external references are out of scope
  let current = root;
  for (const part of ref.slice(2).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || typeof current !== 'object' || !(key in current)) return false;
    current = current[key];
  }
  return true;
}

function checkOpenApi(text, YAML = loadYaml()) {
  const problems = [];
  const doc = YAML.parseDocument(text, { uniqueKeys: true });
  for (const err of doc.errors) problems.push(err.message.split('\n')[0]);
  if (problems.length) return problems;

  const spec = doc.toJS();
  if (!spec || typeof spec !== 'object') return ['The file is not a YAML mapping'];

  for (const key of Object.keys(spec)) {
    if (key.startsWith('/'))
      problems.push(`Path ${key} is at the top level; it belongs under paths`);
    else if (!ALLOWED_TOP_LEVEL.has(key)) problems.push(`Unexpected top-level key: ${key}`);
  }
  if (!spec.openapi) problems.push('Missing the openapi version field');
  if (!spec.paths || typeof spec.paths !== 'object') problems.push('Missing paths');

  const missing = [...new Set(collectRefs(spec).filter((ref) => !resolvePointer(spec, ref)))];
  for (const ref of missing) problems.push(`Unresolved $ref: ${ref}`);
  return problems;
}

function main() {
  const file = process.argv[2] ?? path.join(__dirname, '../../docs/openapi.yaml');
  const problems = checkOpenApi(fs.readFileSync(file, 'utf8'));
  if (problems.length) {
    console.error(`${file}:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${path.basename(file)}: structure and references OK`);
}

if (require.main === module) main();

module.exports = { checkOpenApi };
