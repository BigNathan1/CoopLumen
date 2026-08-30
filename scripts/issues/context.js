'use strict';

/**
 * Shared narrative context, keyed by the exact heading text parse.js extracts
 * from issue.md. Written once per phase/category so every generated issue
 * gets real, repo-accurate background instead of a restatement of its title.
 */
const PHASE_CONTEXT = {
  'PHASE 1 — FOUNDATION':
    'Foundation work to reach a working single-community MVP: infrastructure, schema, core CRUD APIs, the Stellar contract layer, the base frontend, wallet auth, tests, CI, and a hardened security baseline. Every later phase assumes this phase is solid.',
  'PHASE 2 — P2P LENDING & MULTI-SIG':
    'The first major post-MVP capability: peer-to-peer lending pools with reputation scoring, plus multi-signature treasury controls and batch payouts, so a community can coordinate real money beyond simple token transfers.',
  'PHASE 3 — SOROBAN GOVERNANCE':
    'On-chain governance via a Soroban smart contract — token-weighted proposals and voting — so binding community decisions no longer depend on the backend as a trusted intermediary.',
  'PHASE 4 — COMPLIANCE, ADVANCED FEATURES & PRODUCTION':
    'The path to a public, mainnet launch: KYC/compliance groundwork, price/localization/mobile polish, performance hardening, documentation, and the final production go-live checklist.',
};

const CATEGORY_CONTEXT = {
  'Infrastructure & Environment':
    'Baseline developer experience and repo hygiene — Docker Compose services, environment validation, formatting/linting/commit hooks, and the GitHub community files (CODEOWNERS, issue/PR templates, SECURITY.md) that make the project approachable to a first-time contributor.',
  'Database Schema & Migrations':
    'The file-based migration runner (`backend/src/db/migrate.ts`) and the PostgreSQL schema it applies — communities, members, tokens, and the tables reserved for later phases (loans, reputation, multisig, proposals, KYC) that stay dormant until their phase activates them. Schema correctness here underpins every API built on top of it.',
  'Backend API — Communities':
    "The communities router (`backend/src/api/routes/communities.ts`) — CRUD, membership, and treasury endpoints for the platform's core unit. Every other feature (tokens, loans, governance) is scoped to a community.",
  'Backend API — Tokens':
    'The tokens router and the `contracts/assets.ts` wrappers it calls — issuing, transferring, and querying each community\'s Stellar custom asset. Off-chain metadata (Postgres) and on-chain state (Horizon) have to stay consistent here.',
  'Backend API — Balances & Transactions':
    "Endpoints that read and write Stellar account state — balances, trustlines, payments, and the transaction-history audit trail. Handling Horizon's async, eventually-consistent behavior correctly (retries, sequence numbers, mapped error codes) matters more here than almost anywhere else in the backend.",
  'Stellar Contract Layer':
    'The `backend/src/contracts/` Stellar SDK wrapper layer (`stellar.ts`, `assets.ts`, `trustlines.ts`, `transactions.ts`) that every route handler calls into. This is the one place Horizon interaction logic should live — route handlers stay thin and testable.',
  'Frontend — Core & Design System':
    'The shared UI building blocks (`frontend/src/components/ui/`, the `globals.css` design tokens, dark mode, form primitives) that every feature screen is built from. Getting this right once makes every later screen faster to build and visually consistent.',
  'Frontend — Feature Components & Pages':
    'The actual Next.js App Router pages and feature components that let a member use the product end-to-end: dashboard, community detail, membership, tokens, transactions, treasury.',
  'Frontend — Hooks & Data Layer':
    'The SWR-based data-fetching hooks (`frontend/src/hooks/`) that mediate between the UI and the backend API — caching, mutation, optimistic updates, and Freighter signing. Keeping fetch/mutate logic out of components is what keeps the feature layer testable.',
  'Authentication & Authorization':
    "A wallet-based auth flow (challenge → Freighter signature → JWT) and the RBAC middleware that guards write endpoints. Until this lands, every write endpoint is trusting the caller's claimed identity.",
  'Testing — Backend':
    'Integration and unit coverage for the API layer, run against a real (containerized) PostgreSQL instance wherever the behavior under test is about persistence, not mocks standing in for it.',
  'Testing — Frontend & E2E':
    "Component-level tests plus a Playwright E2E suite exercising real user flows against the full Docker Compose stack — the project's highest-confidence signal that a change didn't break the product.",
  'CI/CD Pipeline':
    'The GitHub Actions workflows that gate every PR (lint, typecheck, test, build) and automate release/deploy once merged. `.github/workflows/ci.yml` is the current source of truth for what is already enforced — check it before assuming a check is missing.',
  'Security Hardening':
    'Defense-in-depth beyond auth: rate limiting, input sanitization, security headers, audit logging, and the external review/disclosure process needed before real funds are at stake.',
  'P2P Lending':
    'The Phase 2 headline feature: members request, fund, and repay peer-to-peer loans, with reputation scores computed from repayment history. Activates the `loans`, `loan_repayments`, and `reputation_scores` tables that Phase 1 left dormant.',
  'Multi-Sig & Batch Operations':
    'N-of-M signer controls on community treasury accounts, plus batch disbursement tooling — the primitives a community needs to manage shared funds safely once it outgrows a single trusted administrator.',
  'Soroban Smart Contracts & Governance':
    'A Rust/Soroban smart contract for token-weighted, on-chain proposals and voting, plus the backend/frontend layers that surface it. This is where community decision-making moves from "the backend says so" to "the chain says so."',
  'KYC & Compliance':
    'Groundwork for operating within real-world regulatory constraints — SEP-12-aligned KYC status tracking, per-account transaction limits, and Sybil resistance — scoped deliberately narrow (research and status plumbing) rather than a full compliance platform.',
  'Price Oracle, Mobile & i18n':
    'Product polish that matters for real-world adoption across languages and devices: live price display, a PWA-installable frontend, and translated UI for non-English-speaking communities.',
  'Performance & Optimization':
    'Caching, indexing, and load-testing work to make sure the platform holds up once real communities are using it concurrently — backed by measured before/after numbers, not guesses.',
  Documentation:
    "Reference material a new contributor or self-hosting operator needs that isn't already covered by a category-specific doc: the OpenAPI spec, the deployment guide, and the onboarding walkthrough.",
  'Production Readiness':
    'The final go/no-go checklist before real money moves on Stellar mainnet: observability, an external security audit, and the mainnet cutover itself.',
};

/**
 * Extra acceptance-criteria bullets contributed by each label an issue
 * carries. An issue with multiple labels gets the union, de-duplicated and
 * in this fixed order, so e.g. an `auth` `backend` issue reads consistently
 * with every other `auth` `backend` issue.
 */
const LABEL_CRITERIA = {
  db: [
    'The migration applies cleanly to a fresh database and is idempotent if re-run against an already-migrated one.',
    'Existing data and constraints are unaffected unless the issue explicitly changes them.',
    'The schema change is reflected in `docs/database.md` (or the equivalent schema doc) if one exists.',
  ],
  backend: [
    'Input is validated (Zod, matching the project convention) and errors follow the existing `{ data, meta?, error? }` response envelope.',
    'The change has unit and/or integration test coverage under `backend/src/**/__tests__/`.',
    'Public API surface changes are reflected in the OpenAPI spec (`docs/openapi.yaml`).',
  ],
  stellar: [
    'The Horizon/Stellar interaction is verified against testnet, not just mocked.',
    'Stellar/Horizon error codes are mapped to clear, actionable messages rather than surfaced raw.',
    'Unit tests mock Horizon so the suite stays fast and deterministic.',
  ],
  frontend: [
    'The UI matches the existing design system (CSS custom properties, dark-mode support) rather than introducing one-off styles.',
    'The component has test coverage under `frontend/src/components/__tests__/` (or `hooks/__tests__/`).',
    'Keyboard and screen-reader accessibility is preserved (labels, focus order, ARIA where applicable).',
  ],
  auth: [
    'The change is tested for both the authorized and the unauthorized path — a request that should be rejected actually is.',
    'No secret, token, or private key is logged or exposed in an error response.',
  ],
  test: [
    'The new test fails on the pre-fix behavior and passes once the fix/feature lands (verified, not assumed).',
    'The test is added to the suite that already runs in CI so it executes on every future PR.',
  ],
  e2e: [
    'The Playwright spec exercises the flow against the real Docker Compose stack, not a mocked backend.',
    'The spec is added to the CI `e2e` job so it runs on every PR touching the relevant flow.',
  ],
  'ci/cd': [
    'The workflow has been run on a real PR (or a throwaway branch) and observed to pass.',
    'The workflow also fails correctly when the condition it checks is violated — a green run alone is not sufficient proof.',
  ],
  security: [
    'The change is verified against the specific threat or weakness named in the title, not just "looks more secure."',
    'No existing functionality regresses as a side effect of the hardening.',
  ],
  perf: [
    'A before/after measurement (timing, query plan, load-test result) is included in the PR description.',
  ],
  docs: [
    'The documentation is verified accurate against the current code, not just written to match intent.',
    'The new doc is linked from `README.md` or the relevant docs index so it is discoverable.',
  ],
  infra: [
    'The change has been exercised locally the way a contributor actually would (`docker-compose up`, the relevant `make` target, etc.).',
    "If it changes the contributor workflow, `CONTRIBUTING.md` or `README.md` is updated to match.",
  ],
  'good-first-issue': [
    'The change is scoped small enough for a first-time contributor to complete in under a couple of hours with the linked context.',
  ],
};

/** Fixed, sensible order for combining label criteria across an issue's labels. */
const LABEL_ORDER = [
  'infra',
  'db',
  'backend',
  'stellar',
  'frontend',
  'auth',
  'security',
  'perf',
  'test',
  'e2e',
  'ci/cd',
  'docs',
  'good-first-issue',
];

module.exports = { PHASE_CONTEXT, CATEGORY_CONTEXT, LABEL_CRITERIA, LABEL_ORDER };
