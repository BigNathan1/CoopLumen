/**
 * Trailers and footers crediting an AI assistant as a co-author. Existing
 * history carries a few of these; rewriting it would force every contributor
 * to reset their fork, so they are blocked going forward instead.
 */
const AI_ATTRIBUTION =
  /co-?authored-by:\s*(claude|codebuff|copilot|cursor|devin|chatgpt|gpt-[0-9]|gemini|codex)|generated with\s*\[?(claude|codebuff|copilot|cursor|chatgpt)/i;

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-ai-attribution': ({ raw }) => [
          !AI_ATTRIBUTION.test(raw ?? ''),
          'commit message must not credit an AI assistant as co-author; the human who wrote the change is its author',
        ],
      },
    },
  ],
  rules: {
    'no-ai-attribution': [2, 'always'],
    'type-enum': [
      2,
      'always',
      // `build` is the type Dependabot gives every dependency update.
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'test',
        'chore',
        'perf',
        'revert',
        'ci',
        'build',
      ],
    ],
    'scope-case': [2, 'always', 'lower-case'],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'subject-max-length': [2, 'always', 100],
    // A warning, not an error: one long line (a URL, a pasted log) in an
    // otherwise conventional commit should not block a contributor's PR.
    'body-max-line-length': [1, 'always', 120],
  },
};
