# CI/CD

CoopLumen's automated quality gate lives in `.github/workflows/`.

## `ci.yml` — the required check on every PR

Triggers on every push and on every PR targeting `main`. Jobs:

| Job              | What it checks                                                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint`           | ESLint + Prettier `--check` for both `backend/` and `frontend/`                                                                                                         |
| `typecheck`      | `tsc --noEmit` for both packages                                                                                                                                        |
| `test-backend`   | Jest against a real Postgres 16 service container (migrations run first)                                                                                                |
| `test-frontend`  | Jest (jsdom) for components and hooks                                                                                                                                   |
| `build`          | `npm run build` for both packages — catches build-only breakage that `tsc --noEmit` alone misses (e.g. Next.js server/client boundary errors)                           |
| `docker-build`   | `docker build` for both `Dockerfile`s — catches breakage in the production image path specifically                                                                      |
| `security-audit` | `npm audit --audit-level=high` for both packages. Non-blocking (`continue-on-error: true`) for now — see the comment in the workflow for when to flip it to a hard gate |
| `commitlint`     | Every commit in the PR against `commitlint.config.js` (Conventional Commits). PR-only; doesn't run on direct pushes                                                     |
| `quality-gate`   | Aggregates the jobs above into one pass/fail. Point branch protection at this single job instead of listing every job individually                                      |

**Branch protection**: set `main` to require the `quality-gate` check and at least one approving review before merge (Settings → Branches → Branch protection rules). This isn't configured by the workflow file itself — it's a repo setting.

## `claude-review.yml` — automated first-pass PR review

Runs Anthropic's official Claude Code GitHub Action against every PR, scoped to the same thing a maintainer would check with `/code-review` locally: correctness bugs and reuse/simplification/efficiency opportunities, plus adherence to `CONTRIBUTING.md` conventions.

**Disabled until `ANTHROPIC_API_KEY` is added as a repo secret** (Settings → Secrets and variables → Actions). Until then the job is skipped (not failed), so its absence never blocks a PR. Verify the action's exact inputs against [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) before enabling — action interfaces change across major versions and the workflow comment flags this.

This is a complement to human review, not a replacement for it — findings are suggestions a maintainer (or the project's own `/ultrareview`) still has final say over.

## Dependabot

`.github/dependabot.yml` opens weekly PRs for npm (backend + frontend, grouped into one minor/patch PR per ecosystem to cut noise), Docker base images, and GitHub Actions versions.

## What's intentionally not here yet

The backlog (`issue.md`, CI/CD category) tracks the rest of the pipeline that hasn't been built: staging/production deploy workflows, semantic-release, Trivy container scanning, SonarCloud, and coverage-threshold enforcement. These need real infrastructure (a hosting target, secrets, a release strategy) decided first — adding the workflow YAML before that groundwork exists would just be dead configuration.
