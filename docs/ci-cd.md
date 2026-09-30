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

| Job              | What it checks                                                                                                                                                                     | Timeout |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `lint`           | ESLint + Prettier `--check` for `backend/`, `frontend/`, and the repo root (root covers `scripts/`, `docs/`, and config files that per-workspace runs left unexamined)            | 20 min  |
| `typecheck`      | `tsc --noEmit` for both packages                                                                                                                                                   | 20 min  |
| `test-backend`   | Jest against real Postgres 16 and Redis 7 service containers; migrations run first; tests run serially (`--runInBand`) to avoid race conditions on a shared DB                    | 20 min  |
| `test-frontend`  | Jest (jsdom) for components and hooks                                                                                                                                              | 20 min  |
| `build`          | `npm run build` for both packages — catches build-only breakage that `tsc --noEmit` alone misses (e.g. Next.js server/client boundary errors)                                     | —       |
| `docker-build`   | `docker build` for both `Dockerfile`s — catches breakage in the production image path specifically                                                                                | —       |
| `security-audit` | `npm audit --audit-level=high` for both packages. **Non-blocking** (`continue-on-error: true`) — reports loudly but never fails a PR. See the workflow comment for when to harden | —       |
| `commitlint`     | Every commit in the PR against `commitlint.config.js` (Conventional Commits). PR-only (skipped on direct pushes). Requires `fetch-depth: 0` so the full commit range is available | —       |
| `quality-gate`   | Aggregates `lint`, `typecheck`, `test-backend`, `test-frontend`, `build`, `docker-build`, and `commitlint` into one pass/fail. Point branch protection at this single job          | —       |

> **Why `security-audit` is not in `quality-gate`:** A new upstream CVE would
> immediately break every open PR without giving the team time to triage or
> update the dependency. It is intentionally a loud-but-non-blocking signal.
> Flip `continue-on-error` to `false` in the workflow once the existing finding
> backlog has been triaged and the team wants a hard gate.

#### `test-backend` service containers

The backend test job spins up two Docker services before running tests:

| Service    | Image              | Port  | Health check                               |
| ---------- | ------------------ | ----- | ------------------------------------------ |
| `postgres` | `postgres:16-alpine` | 5432 | `pg_isready -U cooplumen` (5 s interval)   |
| `redis`    | `redis:7-alpine`   | 6379  | `redis-cli ping` (5 s interval)            |

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

**Branch protection**: set `main` to require the `quality-gate` check and at
least one approving review before merge (Settings → Branches → Branch
protection rules). This is a repo setting, not workflow configuration.

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

The backlog (`issue.md`, CI/CD category) tracks the rest of the pipeline that
hasn't been built yet: staging/production deploy workflows, semantic-release,
Trivy container scanning, SonarCloud, and coverage-threshold enforcement. These
need real infrastructure (a hosting target, secrets, a release strategy)
decided first — adding the workflow YAML before that groundwork exists would
just be dead configuration.
