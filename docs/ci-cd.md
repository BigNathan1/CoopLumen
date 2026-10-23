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
| `docker-build`   | `docker build` for both `Dockerfile`s (the production image path); also checks the backend image ships the migration runner and its `.sql` files                                                           | —       |
| `security-audit` | `npm audit --omit=dev --audit-level=high` for both packages fails the job on a high-severity advisory in a production dependency. A full audit including dev tooling is reported but does not fail the job | —       |
| `commitlint`     | Every commit in the PR against `commitlint.config.js` (Conventional Commits). PR-only (skipped on direct pushes). Requires `fetch-depth: 0` so the full commit range is available                          | —       |
| `deploy-scripts` | ShellCheck on `scripts/deploy/*.sh`; tests for health polling, blue/green deploy (migrations, failure, rollback) and chat notifications; validates the prod compose and nginx config                       | 15 min  |
| `sonarcloud`     | SonarCloud analysis and quality gate on the backend and frontend, using the lcov reports from the test jobs. Skipped with a warning when `SONAR_TOKEN` is unavailable (see below)                          | 20 min  |
| `quality-gate`   | Aggregates `lint`, `typecheck`, `test-backend`, `test-frontend`, `build`, `docker-build`, `deploy-scripts`, `sonarcloud`, and `commitlint` into one pass/fail. Point branch protection at this single job  | —       |

> **Why `security-audit` is not in `quality-gate`:** A new upstream CVE would
> immediately block every open PR without giving the team time to triage or
> update the dependency. The job goes red so the finding is visible, but merging
> is not blocked. Dev tooling is only reported, because some of its advisories
> have no patched release (`braces`, via `ts-node-dev` and `eslint-config-next`)
> and that code never ships.

#### `test-governance-e2e` — browser E2E

Runs on pull requests only. It builds the Docker Compose stack
(`docker-compose.yml` + `docker-compose.e2e.yml`), migrates the database, and
runs `npm run test:e2e` in `frontend/`, which executes **every** `*.spec.ts` in
`frontend/e2e/` against the real frontend and backend containers (no mocked
API). A new spec dropped into that folder therefore runs on every PR with no
workflow change. Current specs:

| Spec              | What it proves                                                                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `governance.spec` | A member creates a proposal and casts a vote through the real stack                                                                                                                                                                                  |
| `dark-mode.spec`  | The theme toggle's choice (stored in `localStorage` as `cooplumen-theme`) survives client-side navigation, browser history, a reload and a new tab; an explicit light choice wins over a dark OS preference; and it is applied before React hydrates |

To run one locally: start the stack as the job does, then
`cd frontend && npx playwright test dark-mode`. To see a spec fail for the right
reason, break the behaviour it guards (for example, comment out the
`localStorage.setItem` call in `storeTheme` in `frontend/src/lib/theme.ts`) and
re-run it.

#### `notify-failure` — chat alert when main goes red

Runs after `quality-gate` and posts to the configured Slack or Discord webhook
when `quality-gate` fails on a push to `main`. It is deliberately not part of
`quality-gate`'s `needs`, and its step is `continue-on-error`, so a chat outage
can never block a merge. See [Notifications](#notifications).

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

### Post-deploy verification and rollback

`deploy.sh` rolls back on its own while it is switching: a new slot that never
becomes healthy, a failed proxy reload, or an unhealthy proxy after the switch
all leave the previous version serving. Two further steps in `deploy.yml` cover
a release that passes all of that and then misbehaves:

1. **Verify deployment** polls `/health` through the proxy on the host
   (`wait-for-health.sh`, five consecutive `200`s within 60s). Set the
   repository variable `DEPLOY_PROXY_PORT` if the proxy does not listen on 80.
2. **Roll back** runs only when the Deploy step succeeded and Verify failed. It
   runs `scripts/deploy/rollback.sh`, which redeploys the image that was live
   before this release. The job still ends red, so the failure is visible even
   though production is back on the previous version.

After every successful deploy `deploy.sh` writes the image it retired to
`<STATE_DIR>/previous_image` (default `.deploy/previous_image` in `DEPLOY_PATH`).
`rollback.sh` reads that file and deploys the image through `deploy.sh`, so a
rollback gets the same blue/green switch and health gating as a normal deploy:
if the previous image is no longer healthy it is refused and the live version
keeps serving. `RUN_MIGRATIONS` is forced off for a rollback.

| Situation                                     | Result                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| Verify passes                                 | Nothing further runs; the release stays live                                     |
| Verify fails                                  | Previous image is redeployed, job fails                                          |
| Previous image is unhealthy or never recorded | Rollback refuses, the live version is untouched, job fails                       |
| Deploy step itself fails                      | `deploy.sh` has already restored the previous version; no second rollback is run |
| First ever deploy fails Verify                | Nothing to roll back to; job fails, retry the deploy                             |

To roll back by hand, run `bash scripts/deploy/rollback.sh` in `DEPLOY_PATH` on
the host. Running it again swaps back, because each rollback records the release
it replaced. Rollback moves the application, not the database: migrations only go
forward, so every migration must stay compatible with the release before it (add
columns and tables first, remove them in a later release).

---

## `staging.yml` — deploy and migrate staging

Runs after `CI` succeeds on a push to `main`, or manually (`workflow_dispatch`
with an optional `ref`). It builds and pushes the same backend `production`
image as `deploy.yml`, then runs `RUN_MIGRATIONS=true scripts/deploy/deploy.sh`
on the staging host over SSH. It is independent of `deploy.yml`: both start from
a green `main`, and neither waits for the other.

**Disabled until configured.** Every job is skipped unless the repository
variable `STAGING_ENABLED` is `true`. Configure the `staging` environment with:

| Secret                | Purpose                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `STAGING_HOST`        | Hostname or IP of the staging Docker host                               |
| `STAGING_USER`        | SSH user, which must be able to run `docker`                            |
| `STAGING_PATH`        | Directory on the host that holds the compose file and `.env.production` |
| `STAGING_SSH_KEY`     | Private key for `STAGING_USER`                                          |
| `STAGING_KNOWN_HOSTS` | Pinned host key line(s) from `ssh-keyscan`                              |

The host needs the same setup as production (Docker with the Compose plugin and
a `.env.production` in `STAGING_PATH`), with `DATABASE_URL` pointing at the
staging database.

### How the migration step works

With `RUN_MIGRATIONS=true`, `deploy.sh` runs `node dist/db/migrate.js` in a
one-off container of the **new** image (`docker compose run --rm`) before the
idle slot is started:

- Migrations apply while the previous version is still serving, so they must be
  backward compatible with it. Add before you remove.
- If the migration fails, the deploy aborts right there: the new slot is never
  started, the proxy is not touched, the job fails, and the migration runner's
  output is in the job log. Each migration runs in its own transaction, so a
  failing file leaves no partial change behind.
- The runner takes a Postgres advisory lock, so two overlapping runs cannot
  apply the same file twice.
- The backend `production` image now includes `dist/db/migrations`: `tsc` does
  not emit `.sql` files, so the `Dockerfile` copies them in, and the
  `docker-build` job fails if the runner or the SQL is missing from the image.

Production (`deploy.yml`) does not run migrations yet; opt in later by setting
`RUN_MIGRATIONS=true` in its Deploy step once staging has proven the flow.

---

## Notifications

`scripts/deploy/notify.sh <success|failure> <message> [link]` posts to a Slack or
Discord incoming webhook. It is used for:

| Event                           | Where                            |
| ------------------------------- | -------------------------------- |
| `main` fails CI                 | `notify-failure` job in `ci.yml` |
| Production deployed and healthy | `notify` job in `deploy.yml`     |
| Staging deployed and migrated   | `notify` job in `staging.yml`    |

Setup: create an incoming webhook in Slack (Apps, Incoming Webhooks) or Discord
(Channel settings, Integrations, Webhooks) and store its URL as the repository
secret `NOTIFY_WEBHOOK_URL`. The provider is detected from the URL
(`hooks.slack.com`, `discord.com/api/webhooks`); set `NOTIFY_PROVIDER` to
`slack` or `discord` for anything else, such as a proxy.

Behaviour worth knowing:

- No secret, no message: with `NOTIFY_WEBHOOK_URL` unset (forks, or before setup)
  the script warns and exits 0, so it never fails a pipeline that has not opted
  in.
- A webhook that rejects the message or cannot be reached makes the script exit
  1 without printing the URL. The workflow steps are `continue-on-error`, so a
  chat outage shows as a warning annotation and never turns a deploy or a merge
  red.
- Messages are sent as JSON built by `node`, never interpolated into a shell
  command. Slack control characters (`&`, `<`, `>`) are escaped, Discord mentions
  are disabled, and text is cut to 1900 characters.
- Deployment failures are not announced; the failed run is the signal, and a
  verify-and-rollback shows as a red `deploy` job.

`scripts/deploy/test-notify.sh` runs in the `deploy-scripts` job against a local
fake webhook, covering both payloads, the skip when unconfigured, a rejected
message, an unreachable webhook and bad usage.

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
hasn't been built yet: semantic-release, Trivy container scanning, and
coverage-threshold enforcement. These need real
infrastructure (a hosting target, secrets, a release strategy) decided first —
adding the workflow YAML before that groundwork exists would just be dead
configuration. Production and staging deploys, notifications and SonarCloud are
described above and are inert until their secrets and variables are configured.
