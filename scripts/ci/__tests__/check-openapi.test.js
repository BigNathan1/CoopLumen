'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkOpenApi } = require('../check-openapi.js');

const base = `openapi: 3.0.3
info:
  title: T
  version: '1'
paths:
  /a:
    get:
      responses:
        '200': { $ref: '#/components/responses/Ok' }
components:
  responses:
    Ok:
      description: ok
`;

test('a well-formed spec passes', () => {
  assert.deepEqual(checkOpenApi(base), []);
});

test('the repository spec passes', () => {
  const spec = fs.readFileSync(path.join(__dirname, '../../../docs/openapi.yaml'), 'utf8');
  assert.deepEqual(checkOpenApi(spec), []);
});

test('duplicate keys are reported', () => {
  const problems = checkOpenApi(
    base.replace("        '200':", "        '200': { description: x }\n        '200':")
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /unique/i);
});

test('a path at the top level is reported', () => {
  const problems = checkOpenApi(`/stray:\n  get: {}\n${base}`);
  assert.ok(problems.some((p) => p.includes('/stray is at the top level')));
});

test('an unresolved reference is reported', () => {
  const problems = checkOpenApi(base.replace('responses/Ok', 'responses/Missing'));
  assert.deepEqual(problems, ['Unresolved $ref: #/components/responses/Missing']);
});
