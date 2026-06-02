# Contributing to CoopLumen

Thank you for investing your time in CoopLumen. Every contribution — code, docs, bug reports, or discussions — moves us closer to decentralized financial access for everyone.

---

## Table of Contents

1. [Code of Conduct](#1-code-of-conduct)
2. [Getting Started](#2-getting-started)
3. [Project Structure](#3-project-structure)
4. [Development Workflow](#4-development-workflow)
5. [Branch Naming Convention](#5-branch-naming-convention)
6. [Commit Message Convention](#6-commit-message-convention)
7. [Running Tests and Lint](#7-running-tests-and-lint)
8. [Pull Request Process](#8-pull-request-process)
9. [Code Review Checklist](#9-code-review-checklist)
10. [Conflict Resolution Workflow](#10-conflict-resolution-workflow)
11. [Issue Labeling Scheme](#11-issue-labeling-scheme)
12. [Maintainer Responsibilities](#12-maintainer-responsibilities)

---

## 1. Code of Conduct

All participants are expected to uphold our community standards:

- **Be respectful.** Critique code, not people.
- **Be inclusive.** Welcome contributors of all backgrounds and skill levels.
- **Be patient.** Maintainers are volunteers; allow 72 hours for responses.
- **Be constructive.** Explain *why*, not just *what* when requesting changes.

Violations may be reported to `conduct@cooplumen.org`. Serious violations result in temporary or permanent ban.

---

## 2. Getting Started

### Fork and Clone

```bash
# 1. Fork on GitHub (click "Fork" top-right)
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/cooplumen.git
cd cooplumen

# 3. Add upstream remote
git remote add upstream https://github.com/yourname/cooplumen.git
```

### Set Up the Dev Environment

```bash
# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# Start all services via Docker
docker-compose up

# Or run locally (requires PostgreSQL)
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev

# Run migrations
cd backend && npm run db:migrate
```

### Verify Everything Works

```bash
curl http://localhost:4000/health
# Expected: { "status": "ok", "version": "0.1.0" }
```

Open [http://localhost:3000](http://localhost:3000) and confirm the dashboard loads.

---

## 3. Project Structure

```
cooplumen/
├── backend/src/
│   ├── api/routes/          # Express route handlers
│   ├── api/middleware/      # Error handling, 404
│   ├── contracts/           # Stellar SDK wrappers — core blockchain logic
│   ├── db/                  # Pool, migrations
│   └── utils/               # Logger
├── frontend/src/
│   ├── app/                 # Next.js App Router pages
│   ├── components/          # React UI components
│   └── hooks/               # SWR data-fetching hooks
└── docker-compose.yml
```

New contributors: start with issues labeled [`good first issue`](#issue-labeling-scheme). The `/contracts` module and `/api/routes` are the best places to add features once you understand the flow.

---

## 4. Development Workflow

```
main  ──────────────────────────────────────────► (protected, always deployable)
         │
         ├── feature/token-batch-disburse  ──► PR ──► review ──► squash merge
         ├── fix/trustline-race-condition   ──► PR ──► review ──► squash merge
         └── docs/update-api-reference      ──► PR ──► review ──► squash merge
```

1. **Sync your fork** before starting any work:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```
2. **Create a branch** from `main` (see [naming convention](#5-branch-naming-convention))
3. **Make focused commits** (see [commit convention](#6-commit-message-convention))
4. **Run tests and lint** before pushing (see [section 7](#7-running-tests-and-lint))
5. **Open a pull request** against `main` on the upstream repo

---

## 5. Branch Naming Convention

```
<type>/<short-description>
```

| Prefix | When to use |
|---|---|
| `feature/` | New functionality |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `refactor/` | Code restructuring without behavior change |
| `test/` | Adding or fixing tests |
| `chore/` | Dependency bumps, config changes, CI |
| `perf/` | Performance improvements |

**Examples:**
```
feature/p2p-loan-request-api
fix/balance-panel-undefined-key
docs/add-soroban-integration-guide
refactor/extract-stellar-client-singleton
test/increase-community-routes-coverage
chore/upgrade-stellar-sdk-v13
```

- Use lowercase and hyphens, no underscores or slashes in the description
- Keep it under 50 characters
- Reference the issue number when applicable: `fix/42-trustline-limit-zero`

---

## 6. Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

### Format

```
<type>(<scope>): <short summary>

[optional body]

[optional footer: BREAKING CHANGE / Closes #issue]
```

### Types

| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `style` | Formatting, whitespace — no logic change |
| `refactor` | Code restructuring with no behavior change |
| `test` | Adding or correcting tests |
| `chore` | Build system, CI, dependency updates |
| `perf` | Performance improvement |
| `revert` | Reverting a previous commit |

### Scopes

Use the module name: `contracts`, `api`, `db`, `frontend`, `docker`, `docs`.

### Examples

```
feat(contracts): add batch payment operation for multi-recipient disbursal

fix(api): return 409 instead of 500 when community name already exists

docs(contributing): add conflict resolution section

test(contracts): add hasTrustline unit tests for native-only accounts

chore(docker): upgrade postgres image from 15 to 16-alpine

feat(frontend): add BalancePanel component with 15s SWR refresh

BREAKING CHANGE: establishTrustline now requires assetIssuer instead of Asset object
```

### Rules

- Subject line: imperative mood, lowercase, no period, ≤72 characters
- Body: wrap at 80 characters, explain *why* not *what*
- One logical change per commit; squash WIP commits before opening a PR

---

## 7. Running Tests and Lint

**Always run these before pushing.**

```bash
# Backend
cd backend
npm run lint          # ESLint
npm run type-check    # TypeScript (no emit)
npm test              # Jest unit + integration
npm run test:coverage # Coverage report

# Frontend
cd frontend
npm run lint          # Next.js ESLint
npm run type-check    # TypeScript
npm test              # Jest + Testing Library
```

### Coverage thresholds

- Backend: minimum **70%** line coverage (enforced in CI)
- Frontend: minimum **60%** component coverage

### Pre-push hook (optional but recommended)

```bash
# Install lefthook
npm install -g lefthook
lefthook install
```

This runs lint + type-check automatically before each push.

---

## 8. Pull Request Process

### Before Opening

- [ ] Branch is up to date with `upstream/main` (rebase, not merge)
- [ ] All tests pass locally
- [ ] Lint and type-check pass
- [ ] New features have accompanying tests
- [ ] Documentation updated if public API changed

### PR Template

When you open a PR, fill in the auto-generated template:

```markdown
## What does this PR do?
<!-- 2-3 sentences. Link to the issue it closes. -->

Closes #<issue_number>

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Documentation
- [ ] Tests only

## Testing
<!-- How did you test this? What scenarios did you cover? -->

## Screenshots (if frontend)
<!-- Before/after or just "after" for new UI -->

## Checklist
- [ ] Tests added/updated
- [ ] Docs updated
- [ ] No secrets in diff
- [ ] Rebased on upstream/main
```

### Review SLA

- Maintainers aim to review within **72 hours** of opening
- If no response in 5 business days, ping `@maintainers` in the PR comment

### Merge Strategy

- **Squash and merge** is the default — keeps `main` history linear
- Multi-commit PRs that tell a meaningful story may be **merge committed** at maintainer discretion
- **No force-pushes to `main`** ever

---

## 9. Code Review Checklist

Reviewers use this checklist when approving PRs:

### Correctness
- [ ] Logic is correct for both happy path and error cases
- [ ] No unhandled promise rejections
- [ ] Stellar operations handle network failures gracefully

### Security
- [ ] No private keys logged or returned in API responses
- [ ] User input validated at API boundary (`express-validator`)
- [ ] No SQL injection vectors (parameterized queries only)
- [ ] No new CORS or CSP weakening

### Code Quality
- [ ] TypeScript `strict` mode — no `any` without justification
- [ ] Functions are small, named clearly, and do one thing
- [ ] No commented-out code or debug `console.log`
- [ ] Comments explain *why*, not *what*

### Testing
- [ ] New feature has at least one unit test
- [ ] Edge cases and error paths are tested
- [ ] Mocks are scoped and cleaned up in `afterEach`

### Documentation
- [ ] Public APIs are described in README.md if new
- [ ] PRD.md updated if feature changes scope or roadmap

---

## 10. Conflict Resolution Workflow

### For Code Conflicts (rebase approach)

```bash
# 1. Fetch latest upstream
git fetch upstream

# 2. Rebase your branch
git rebase upstream/main

# 3. Resolve conflicts in each file
#    - Accept upstream, yours, or combine manually
#    - Never blindly accept all of one side

# 4. Stage resolved files
git add <resolved-file>

# 5. Continue rebase
git rebase --continue

# 6. Force-push your branch (your fork only, never upstream main)
git push --force-with-lease origin <your-branch>
```

### For Design / Opinion Conflicts

1. **Label the PR** with `needs-discussion`
2. **State your position once**, clearly, with reasoning — not repeatedly
3. **Escalate to async discussion** in GitHub Discussions if unresolved after 3 comments
4. **Maintainer decision is final** after 5 business days of open discussion

### For Merge Conflicts in Long-Running PRs

If your PR has been open for more than 2 weeks and conflicts accumulate:
1. Close the PR
2. Rebase onto current `main`
3. Open a fresh PR with a note linking to the old one

This keeps the review diff clean and reviewable.

---

## 11. Issue Labeling Scheme

| Label | Color | Description |
|---|---|---|
| `good first issue` | `#7057ff` | Beginner-friendly; well-scoped, documented |
| `help wanted` | `#008672` | Maintainers welcome community ownership |
| `bug` | `#d73a4a` | Confirmed defect in existing functionality |
| `feature` | `#a2eeef` | New capability request |
| `docs` | `#0075ca` | Documentation improvement |
| `needs-discussion` | `#e4e669` | Design question unresolved |
| `blocked` | `#b60205` | Waiting on external dependency or decision |
| `duplicate` | `#cfd3d7` | Issue already tracked elsewhere |
| `wontfix` | `#ffffff` | Out of scope or intentionally not addressed |
| `Phase 2` | `#fbca04` | Planned for Phase 2 milestone |
| `Phase 3` | `#f9d0c4` | Planned for Phase 3 milestone |
| `security` | `#e11d48` | Security-sensitive — maintainer triage only |

### Reporting a Security Vulnerability

**Do not open a public GitHub issue.** Email `security@cooplumen.org` with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

We will acknowledge within 24 hours and disclose responsibly after a fix is deployed.

---

## 12. Maintainer Responsibilities

Maintainers are community members with write access to the main repository. Their responsibilities:

- **Triage new issues** within 72 hours (add labels, request clarification, or close as duplicate)
- **Review PRs** within 72 hours of opening or update
- **Enforce** the branch model and commit convention on all merges
- **Maintain** the `main` branch in a deployable state at all times
- **Keep** the roadmap in PRD.md current each quarter
- **Release** tagged versions (`v0.x.y`) monthly during active development phases
- **Rotate** maintainer access reviews every 6 months

### Becoming a Maintainer

Sustained contributors (5+ merged PRs, positive community engagement) may be nominated by existing maintainers. Nominations are approved by simple majority of current maintainers.

---

## Thank You

Every contribution matters — whether it's fixing a typo, adding a test, or building a new lending flow. We're building something that can genuinely improve financial access for underserved communities worldwide. We're glad you're here.

**Happy building. ◆**
