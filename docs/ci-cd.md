# CI/CD

CoopLumen's automated quality gate lives in `.github/workflows/`.

## `ci.yml` — the required check on every PR

Triggers on every push to any branch and on every pull request targeting `main`.

### Concurrency

A `concurrency` group (`ci-${{ github.ref }}`) cancels any in-progress run on
the same ref the moment a newer commit is pushed. This saves CI minutes on
fast-moving branches and ensures the result you see is always from the latest
commit.

### Node version

All jobs pin Node.js at `20` via a shared `NODE_VERSION` env var so upgrading
the runtime is a one-line change.

### Jobs

| Job              | What it checks                                                                                                                                                                                             | Timeout |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `lint`           | ESLint + Prettier `--check` for `backend/`, `frontend/`, and the repo root (root covers `scripts/`, `docs/`, and config files that per-workspace runs left unexamined)                                     | 20 min  |
| `typecheck`      | `tsc --noEmit` for both packages                                                                                                                                                                           | 20 min  |
| `test-backend`   | Jest against real Postgres 16 and Redis 7 service containers; migrations run first; tests run serially (`--runInBand`) to avoid race conditions on a shared DB                                             | 20 min  |
| `test-frontend`  | Jest (jsdom) for components and hooks                                                                                                                                                                      | 20 min  |
| `build`          | `npm run build` for both packages — catches build-only breakage that `tsc --noEmit` alone misses (e.g. Next.js server/client boundary errors)                                                              | —       |
| `docker-build`   | `docker build` for both `Dockerfile`s — catches breakage in the production image path specifically                                                                                                         | —       |
| `trivy-scan`     | Aqua Security Trivy container scan for backend and frontend production images, failing on high or critical unfixed vulnerabilities                                                                         | —       |
| `security-audit` | `npm audit --omit=dev --audit-level=high` for both packages fails the job on a high-severity advisory in a production dependency. A full audit including dev tooling is reported but does not fail the job | —       |
| `commitlint`     | Every commit in the PR against `commitlint.config.js` (Conventional Commits). PR-only (skipped on direct pushes). Requires `fetch-depth: 0` so the full commit range is available                          | —       |
| `quality-gate`   | Aggregates `lint`, `typecheck`, `test-backend`, `test-frontend`, `test-contracts`, `test-governance-e2e`, `build`, `docker-build`, `trivy-scan`, and `commitlint` into one pass/fail                       | —       |

> **Why `security-audit` is not in `quality-gate`:** A new upstream CVE would
> immediately block every open PR without giving the team time to triage or
> update the dependency. The job goes red so the finding is visible, but merging
> is not blocked. Dev tooling is only reported, because some of its advisories
> have no patched release (`braces`, via `ts-node-dev` and `eslint-config-next`)
> and that code never ships.

#### `test-backend` service containers

The backend test job spins up two Docker services before running tests:

| Service    | Image                | Port | Health check                             |
| ---------- | -------------------- | ---- | ---------------------------------------- |
| `postgres` | `postgres:16-alpine` | 5432 | `pg_isready -U cooplumen` (5 s interval) |
| `redis`    | `redis:7-alpine`     | 6379 | `redis-cli ping` (5 s interval)          |

Both services must be healthy before the job's steps begin. The job injects
`DATABASE_URL`, `REDIS_URL`, `STELLAR_NETWORK`, and `STELLAR_HORIZON_URL` as
environment variables so the test suite connects without any secrets.

#### `build` dummy environment variables

`next build` requires the public env vars to be present at build time even
though their real values are injected at deploy time. The `build` job supplies:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
```

These are placeholder values — they let the build job run without secrets and
are overwritten by the real deployment environment at runtime.

**Branch protection**: `main` requires the `quality-gate` status check and at
least one approving review before merge. This rule enforces:

- Required status checks: `strict: true` (branch must be up-to-date) and contexts: `["Quality gate"]`.
- Required pull request reviews: `required_approving_review_count: 1`, `dismiss_stale_reviews: true`.
- Protection can be configured via GitHub Settings or automated via:
  ```bash
  npm run ci:branch-protection
  # Or verify compliance without mutating:
  npm run ci:branch-protection -- --verify
  ```

---

## `release.yml` — automated semantic releases

Automatically triggered on merge to `main` (and callable via `workflow_dispatch`).
Uses `semantic-release` (configured in `release.config.js`) to:

1. Analyze conventional commit history since the last release tag.
2. Determine next semver increment (`feat` -> minor, `fix` -> patch, `BREAKING CHANGE` -> major).
3. Generate structured release notes.
4. Publish a GitHub release and push the corresponding git tag.

Runs with `contents: write`, `issues: write`, and `pull-requests: write` permissions.

---

## `publish-docker.yml` — publishing container images to GHCR

Triggered on push to `main` (and callable via `workflow_dispatch`).
Builds and pushes production multi-stage Docker images to GitHub Container Registry (`ghcr.io`):

- `ghcr.io/<owner>/cooplumen/backend`
- `ghcr.io/<owner>/cooplumen/frontend`

Tagged with `latest`, short commit SHA (`sha-<short-sha>`), branch ref, and semver tag when applicable.

---

## `claude-review.yml` — automated first-pass PR review

Runs Anthropic's official Claude Code GitHub Action against every PR, scoped
to the same thing a maintainer would check with `/code-review` locally:
correctness bugs and reuse/simplification/efficiency opportunities, plus
adherence to `CONTRIBUTING.md` conventions.

**Disabled until `ANTHROPIC_API_KEY` is added as a repo secret** (Settings →
Secrets and variables → Actions). Until then the job is skipped (not failed),
so its absence never blocks a PR. Verify the action's exact inputs against
[anthropics/claude-code-action](https://github.com/anthropics/claude-code-action)
before enabling — action interfaces change across major versions and the
workflow comment flags this.

This is a complement to human review, not a replacement for it.

---

## Dependabot

`.github/dependabot.yml` opens weekly PRs for npm (backend + frontend, grouped
into one minor/patch PR per ecosystem to cut noise), Docker base images, and
GitHub Actions versions.

---

## What's intentionally not here yet

The backlog (`issue.md`, CI/CD category) tracks future pipeline enhancements that
haven't been built yet: staging/production deploy workflows, SonarCloud, and
coverage-threshold enforcement. These need real infrastructure (a hosting target,
secrets, deploy targets) decided first.
