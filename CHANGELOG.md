# Changelog

All notable changes to CoopLumen are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Loans API: full lifecycle — create, disburse, repay (partial/full), default, and cancel
- Loan event log and per-loan repayment summary (`GET /api/loans/:id`, `/events`)
- Borrower reputation scoring driven by loan outcomes (on-time repayments vs. defaults)
- Migration 015: loan lifecycle columns (status constraint, repayment tracking, timestamps)
- Project renamed from StellarCommons to CoopLumen
- Live `GET /health` endpoint probing DB and Stellar Horizon connectivity
- `db.ping()` and `StellarService.ping()` helpers
- Frontend `GET /api/health` Next.js route for Docker health checks
- Docker health checks for backend (30s grace) and frontend (60s grace)
- Startup env-var validation — exits early with a clear message on missing vars
- `.nvmrc` pinning Node.js 20 LTS
- `engines` field in all `package.json` files enforcing Node ≥ 20
- `.editorconfig` for consistent indentation and line endings
- Prettier with shared `.prettierrc` and `format` / `format:check` scripts
- `.gitattributes` enforcing LF line endings across all platforms
- Husky pre-commit hook running lint-staged
- lint-staged running ESLint + Prettier on staged files only
- commitlint enforcing Conventional Commits on every commit message
- `Makefile` with `dev`, `test`, `lint`, `format`, `migrate`, `seed`, and more
- `docker-compose.override.yml` with Node.js debugger port, verbose logging, and optional pgAdmin
- Hardened multi-stage Dockerfiles for backend and frontend
- Next.js `output: standalone` for minimal production image
- `.dockerignore` files for backend and frontend
- `CODEOWNERS`, issue templates, PR template, `SECURITY.md`, `CHANGELOG.md`

---

## [0.1.0] — 2026-05-13

### Added

- Initial monorepo scaffold: Next.js 14 frontend + Node.js/Express backend + PostgreSQL
- Stellar SDK integration: asset issuance, trustlines, payments
- Community registration and member management API
- Balance dashboard with Freighter wallet integration
- Jest test setup for backend and frontend
- Docker Compose orchestration for all three services
- ESLint + TypeScript strict mode across both workspaces
- Winston structured logging
- `README.md`, `PRD.md`, `CONTRIBUTING.md`
