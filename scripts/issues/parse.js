'use strict';

const fs = require('fs');

const ITEM_RE = /^- \[( |x)\] #(\d{3}) ((?:`[^`]+`\s*)+)— (.+)$/;
const PHASE_RE = /^## (PHASE \d+ — .+)$/;
const CATEGORY_RE = /^### Category \d+: (.+?) \(\d+[–-]\d+\)$/;

/**
 * Parses the checkbox-list backlog in issue.md into structured records.
 * Each item's phase/category is whatever heading last appeared above it, so
 * headings are the single source of truth for grouping (their stated number
 * ranges are cosmetic and may drift — callers should recompute ranges from
 * the parsed items rather than trust the heading text).
 *
 * @param {string} mdPath absolute path to issue.md
 * @returns {{ number: number, done: boolean, labels: string[], title: string, phase: string, category: string }[]}
 */
function parseBacklog(mdPath) {
  const lines = fs.readFileSync(mdPath, 'utf8').split(/\r?\n/);
  const items = [];
  let phase = null;
  let category = null;

  for (const line of lines) {
    const phaseMatch = line.match(PHASE_RE);
    if (phaseMatch) {
      phase = phaseMatch[1];
      continue;
    }
    const categoryMatch = line.match(CATEGORY_RE);
    if (categoryMatch) {
      category = categoryMatch[1];
      continue;
    }
    const itemMatch = line.match(ITEM_RE);
    if (itemMatch) {
      const [, checked, num, labelBlock, title] = itemMatch;
      const labels = [...labelBlock.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      items.push({
        number: Number(num),
        done: checked === 'x',
        labels,
        title: title.trim(),
        phase,
        category,
      });
    }
  }

  return items;
}

module.exports = { parseBacklog };
