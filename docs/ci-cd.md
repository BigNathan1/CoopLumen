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

| Job              | What it checks                                                                                                                                                                                                           | Timeout |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `lint`           | ESLint + Prettier `--check` for `backend/`, `frontend/`, and the repo root (root covers `scripts/`, `docs/`, and config files that per-workspace runs left unexamined)                                                   | 20 min  |
| `typecheck`      | `tsc --noEmit` for both packages                                                                                                                                                                                         | 20 min  |
| `test-backend`   | Jest against real Postgres 16 and Redis 7 service containers; migrations run first; tests run serially (`--runInBand`) to avoid race conditions on a shared DB                                                           | 20 min  |
| `test-frontend`  | Jest (jsdom) for components and hooks                                                                                                                                                                                    | 20 min  |
| `build`          | `npm run build` for both packages — catches build-only breakage that `tsc --noEmit` alone misses (e.g. Next.js server/client boundary errors)                                                                            | —       |
| `docker-build`   | `docker build` for both `Dockerfile`s — catches breakage in the production image path specifically                                                                                                                       | —       |
| `security-audit` | `npm audit --omit=dev --audit-level=high` for both packages fails the job on a high-severity advisory in a production dependency. A full audit including dev tooling is reported but does not fail the job               | —       |
| `commitlint`     | Every commit in the PR against `commitlint.config.js` (Conventional Commits). PR-only (skipped on direct pushes). Requires `fetch-depth: 0` so the full commit range is available                                        | —       |
| `deploy-scripts` | Lints `scripts/deploy/*.sh` with ShellCheck, runs the health-check poller and blue/green deploy tests (pass, failed health check, failed reload, rollback), and validates `docker-compose.prod.yml` and the nginx config | 15 min  |
| `sonarcloud`     | SonarCloud analysis and quality gate on the backend and frontend, using the lcov reports from the test jobs. Skipped with a warning when `SONAR_TOKEN` is unavailable (see below)                                        | 20 min  |
| `quality-gate`   | Aggregates `lint`, `typecheck`, `test-backend`, `test-frontend`, `build`, `docker-build`, `deploy-scripts`, `sonarcloud`, and `commitlint` into one pass/fail. Point branch protection at this single job                | —       |

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

**Branch protection**: set `main` to require the `quality-gate` check and at
least one approving review before merge (Settings → Branches → Branch
protection rules). This is a repo setting, not workflow configuration.

### SonarCloud quality gate

The `sonarcloud` job runs after `test-backend` and `test-frontend`, which now
run Jest with `--coverage` and upload `lcov.info` as artifacts. The scanner is
configured by `sonar-project.properties` and called with
`sonar.qualitygate.wait=true`, so it blocks until SonarCloud has evaluated the
gate and fails the job if the gate fails. `quality-gate` includes the job, so a
failing gate blocks the PR.

One-time setup (maintainers):

1. Import the repository at [sonarcloud.io](https://sonarcloud.io) and confirm
   `sonar.organization` and `sonar.projectKey` in `sonar-project.properties`
   match the project it creates.
2. Add the project token as the `SONAR_TOKEN` repository secret.
3. Choose the gate in SonarCloud (the default "Sonar way" requires 80% coverage
   on new code, no new bugs or vulnerabilities, and under 3% duplication).
4. In SonarCloud, switch off Automatic Analysis for the project, which conflicts
   with CI-based analysis.

Pull requests from forks cannot read repository secrets. For those the job
emits a warning and is skipped, which `quality-gate` treats as passing. The gate
is enforced on pushes to this repository and on same-repository PRs; a
maintainer should treat a fork PR's skipped SonarCloud job as "not yet analysed".

---

## `deploy.yml` — zero-downtime deploys

Runs after `CI` succeeds on a push to `main`, or manually (`workflow_dispatch`
with an optional `ref`). It builds the backend `production` image, pushes it to
GHCR tagged `sha-<12 chars>`, then runs `scripts/deploy/deploy.sh` on the
deploy host over SSH. Deploys are serialized by a concurrency group and never
cancelled part-way.

**Disabled until configured.** Both jobs are skipped unless the repository
variable `DEPLOY_ENABLED` is `true`, so the workflow is inert until a host
exists. Configure the `production` environment with these secrets:

| Secret               | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `DEPLOY_HOST`        | Hostname or IP of the Docker host                                       |
| `DEPLOY_USER`        | SSH user, which must be able to run `docker`                            |
| `DEPLOY_PATH`        | Directory on the host that holds the compose file and `.env.production` |
| `DEPLOY_SSH_KEY`     | Private key for `DEPLOY_USER`                                           |
| `DEPLOY_KNOWN_HOSTS` | Pinned host key line(s) from `ssh-keyscan`, so the host is verified     |

The host also needs Docker with the Compose plugin and a `.env.production` file
in `DEPLOY_PATH` (use `backend/.env.example` as the template; set
`TRUST_PROXY=1`, since the API now sits behind the nginx proxy).

### How the switch works

`docker-compose.prod.yml` runs an nginx `proxy` and two interchangeable API
slots, `backend-blue` and `backend-green`. Only one receives traffic.

1. Start the idle slot on the new image. The live slot is not touched.
2. Poll the idle slot's `/health` (`scripts/deploy/wait-for-health.sh`). It needs
   three consecutive `200`s within `HEALTH_TIMEOUT` (default 90s). `/health`
   returns `503` while the database is unreachable, so a container that has
   started but cannot serve is not promoted.
3. Rewrite the proxy upstream and `nginx -s reload`. Reload is graceful: new
   workers use the new slot while old workers finish in-flight requests.
4. Poll `/health` through the proxy to confirm the switch end to end.
5. Stop the previous slot. The API handles `SIGTERM` by refusing new connections
   and finishing in-flight ones (up to the 30s `stop_grace_period`).

### Failure handling

| Failure                                          | Result                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| New slot fails to start or never becomes healthy | The slot is stopped and removed, the job fails, the live slot never stopped serving |
| `nginx -t` or reload fails                       | Upstream file restored to the live slot, new slot removed, job fails                |
| Proxy health fails after the switch              | Upstream restored to the previous slot and reloaded, new slot removed, job fails    |

The first deploy has no previous slot, so there is nothing to roll back to; it
fails closed (nothing is promoted) and can be retried.

### What is verified, and what is not

`deploy-scripts` in `ci.yml` runs the real `deploy.sh` and `wait-for-health.sh`
against a fake `docker` and local fake servers, covering the pass path and each
failure row above. It does not start Docker or nginx; the compose file and nginx
config are validated with `docker compose config` and `nginx -t`. The first
rollout to a real host should be watched, and a deliberately unhealthy image
(for example one with a bad `DATABASE_URL`) deployed once to see the rollback
happen on real infrastructure.

Only the backend is covered. The frontend image is not deployed by this
workflow.

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
hasn't been built yet: a staging environment, semantic-release, Trivy
container scanning, and coverage-threshold enforcement. These need real
infrastructure (a hosting target, secrets, a release strategy) decided first —
adding the workflow YAML before that groundwork exists would just be dead
configuration. Production deploys and SonarCloud are described above and are
inert until their secrets and variables are configured.
