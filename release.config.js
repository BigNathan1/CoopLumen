'use strict';

/**
 * semantic-release configuration for CoopLumen.
 *
 * Automatically generates version numbers, changelog notes, and GitHub
 * releases from Conventional Commits merged to `main`.
 */
module.exports = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
      },
    ],
    '@semantic-release/github',
  ],
};
