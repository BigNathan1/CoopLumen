'use strict';

const { PHASE_CONTEXT, CATEGORY_CONTEXT, LABEL_CRITERIA, LABEL_ORDER } = require('./context');

/** Backlog number formatted as the project's stable cross-reference, e.g. "#061". */
function backlogRef(issue) {
  return `#${String(issue.number).padStart(3, '0')}`;
}

/**
 * GitHub issue title. Prefixed with the backlog number in brackets so the
 * project's internal numbering (stable) survives even though GitHub assigns
 * its own issue numbers on creation, which will only coincidentally match.
 */
function renderTitle(issue) {
  return `[${backlogRef(issue)}] ${issue.title}`;
}

function renderAcceptanceCriteria(issue) {
  const bullets = [`${issue.title.replace(/`/g, '`')} — implemented as described above.`];
  const seen = new Set();
  for (const label of LABEL_ORDER) {
    if (!issue.labels.includes(label)) continue;
    for (const bullet of LABEL_CRITERIA[label] ?? []) {
      if (seen.has(bullet)) continue;
      seen.add(bullet);
      bullets.push(bullet);
    }
  }
  return bullets;
}

/**
 * Full markdown body for one backlog item: Summary, Context (phase +
 * category, shared and repo-accurate), Acceptance Criteria (label-driven,
 * de-duplicated), and a standard Definition of Done. This is deliberately a
 * lighter template than a full spike/RFC issue — most of these 500 items are
 * concrete, scoped tasks, not open-ended research; the template scales to
 * that reality instead of padding every item to look like an epic.
 */
function renderBody(issue) {
  const categoryContext = CATEGORY_CONTEXT[issue.category] ?? '';
  const phaseContext = PHASE_CONTEXT[issue.phase] ?? '';
  const labelLine = issue.labels.map((l) => `\`${l}\``).join(' ');
  const criteria = renderAcceptanceCriteria(issue)
    .map((b) => `- [ ] ${b}`)
    .join('\n');

  return `**Backlog reference:** ${backlogRef(issue)} · ${labelLine}

## Summary

${issue.title}

## Context

${categoryContext}

${phaseContext}

## Acceptance Criteria

${criteria}

## Definition of Done

- [ ] Implemented on a branch and opened as a PR referencing this issue (\`Closes ${backlogRef(issue)}\` won't auto-link since this is a repo-internal reference — mention the issue number GitHub assigned instead).
- [ ] CI is green (lint, typecheck, tests, build).
- [ ] Reviewed against \`CONTRIBUTING.md\` conventions (Conventional Commits, code style).
- [ ] \`CHANGELOG.md\` updated under \`[Unreleased]\` if the change is user- or API-visible.
- [ ] Merged to \`main\`.

---
_Generated from the CoopLumen backlog (\`issue.md\`). See \`CONTRIBUTING.md\` for the contribution workflow._
`;
}

module.exports = { backlogRef, renderTitle, renderAcceptanceCriteria, renderBody };
