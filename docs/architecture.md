# CoopLumen — Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser / PWA                             │
│    Next.js 14 (App Router)  ·  Freighter Wallet Extension       │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST/JSON  (port 3000 → 4000)
┌───────────────────────────────▼─────────────────────────────────┐
│               Node.js 20 / Express 4 API  (port 4000)           │
│                                                                  │
│  /api/v1/communities    /api/v1/tokens    /api/v1/balances       │
│  /api/v1/transactions   /api/v1/trustlines                       │
│  /health                                                         │
│                                                                  │
│  ┌──────────────────────┐   ┌──────────────────────────────┐    │
│  │  contracts/          │   │  PostgreSQL 16 (port 5432)   │    │
│  │  stellar.ts          │   │  communities · members        │    │
│  │  assets.ts           │   │  tokens · transactions_log    │    │
│  │  trustlines.ts       │   │  loans · proposals · votes    │    │
│  │  transactions.ts     │   └──────────────────────────────┘    │
│  └──────────┬───────────┘                                        │
└─────────────┼───────────────────────────────────────────────────┘
              │ Stellar SDK v12 (Horizon REST)
┌─────────────▼───────────────────────────────────────────────────┐
│               Stellar Network (Testnet / Mainnet)                │
│       Horizon API · Asset issuance · Trustlines · Payments      │
│                   Soroban contracts (Phase 3)                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer              | Technology                  | Version | Notes                              |
| ------------------ | --------------------------- | ------- | ---------------------------------- |
| Frontend framework | Next.js (App Router)        | 14.2    | SSR + client components            |
| UI language        | TypeScript                  | 5.5     | Strict mode                        |
| Wallet             | Freighter browser extension | API v2  | Signs XDR transactions client-side |
| Data fetching      | SWR                         | 2.2     | Polling + cache invalidation       |
| Styling            | CSS Modules                 | —       | Per-component `.module.css`        |
| API server         | Express                     | 4.19    | REST + JSON                        |
| Blockchain SDK     | `@stellar/stellar-sdk`      | 12.3    | Horizon + Soroban                  |
| Database           | PostgreSQL                  | 16      | Off-chain metadata                 |
| DB client          | `pg`                        | 8.12    | Parameterised queries only         |
| Logging            | Winston                     | 3.13    | JSON in prod, pretty in dev        |
| Validation         | express-validator           | 7.2     | API boundary input checks          |
| Security headers   | Helmet.js                   | 7.1     | CSP, HSTS, X-Frame-Options         |
| Containers         | Docker + Compose            | 3.9     | Reproducible dev environment       |
| Testing            | Jest + ts-jest              | 29.7    | Unit + integration                 |
| E2E (planned)      | Playwright                  | —       | Phase 1 CI                         |

---

## Key Design Decisions

### No private keys server-side for user wallets

User wallets are owned entirely by Freighter. The backend never sees a private key — it builds unsigned XDR, returns it to the frontend, Freighter signs it, and the signed XDR is submitted back to the backend (or directly to Horizon).

### Community distributor account

Each community has a _distributor_ Stellar account (multi-sig in Phase 2). Initial token supply flows from issuer → distributor. The backend holds the distributor signing key (encrypted at rest in Phase 2+). In Phase 1 (testnet), it is stored in environment variables.

### PostgreSQL as off-chain metadata store

Stellar is the source of truth for balances and transactions. PostgreSQL stores metadata that can't be queried efficiently on-chain: community names, member roles, loan terms, reputation scores, proposal text. On conflict, Stellar always wins.

### SWR polling strategy

- Balances: 15-second refresh (`useSWR` with `refreshInterval`)
- Communities: 30-second refresh
- Transactions: 20-second refresh
- Mutations use `mutate()` for optimistic updates

---

## Data Flow Examples

### Issue a community token

```
Treasurer fills form → POST /api/v1/tokens/issue
  → express-validator validates input
  → contracts/assets.issueAsset() builds + signs transaction
  → Stellar SDK submits to Horizon
  → Horizon settles (~4s)
  → Backend records token metadata to PostgreSQL
  → Frontend SWR revalidates balance
```

### Transfer tokens (user-signed)

```
Member fills transfer form → POST /api/v1/transactions/unsigned
  → Backend builds unsigned Payment XDR
  → Returns XDR to frontend
  → Frontend calls freighter.signTransaction(xdr)
  → Freighter shows approval popup, user confirms
  → Signed XDR returned → POST /api/v1/transactions/submit
  → Backend submits to Horizon
  → Balance updates via SWR poll
```

---

## Directory Structure

```
CoopLumen/
├── .github/              # CODEOWNERS, issue templates, PR template
├── backend/
│   └── src/
│       ├── api/
│       │   ├── middleware/   # errorHandler, notFound
│       │   └── routes/       # communities, tokens, balances, transactions
│       ├── contracts/        # Stellar SDK wrappers
│       │   ├── stellar.ts    # Horizon server singleton + ping
│       │   ├── assets.ts     # issueAsset, distributeAsset, burnAsset
│       │   ├── trustlines.ts # establishTrustline, hasTrustline
│       │   └── transactions.ts # buildPayment, submitSigned, batchPayment
│       ├── db/
│       │   ├── index.ts      # pg pool, query(), transaction(), ping()
│       │   ├── migrate.ts    # migration runner
│       │   └── migrations/   # numbered SQL files
│       └── utils/
│           └── logger.ts     # Winston instance
├── frontend/
│   └── src/
│       ├── app/              # Next.js App Router pages + API routes
│       ├── components/       # UI components (CSS Modules)
│       └── hooks/            # SWR data-fetching hooks
├── docs/                     # Architecture, database schema, guides
├── docker-compose.yml        # Base services
├── docker-compose.override.yml  # Local dev overrides
└── Makefile                  # Developer shortcuts
```

---

## Security Model

- All user input validated at the API boundary (`express-validator` / Zod)
- Parameterised queries only — no raw SQL concatenation
- Helmet.js enforces CSP, HSTS, X-Frame-Options
- CORS restricted to `FRONTEND_URL`
- Rate limiting on all write endpoints (Phase 1: `express-rate-limit`)
- JWT authentication (wallet-challenge-response) in Phase 1
- Multi-sig treasury accounts in Phase 2
- Soroban-governed treasury in Phase 3

---

## Roadmap Phases

| Phase              | Target     | Key deliverables                                            |
| ------------------ | ---------- | ----------------------------------------------------------- |
| **1 — Foundation** | Q3 2026    | Token issuance, trustlines, community dashboard, CI/CD      |
| **2 — Lending**    | Q4 2026    | P2P loans, reputation scores, multi-sig, batch disbursement |
| **3 — Governance** | Q1 2027    | Soroban DAO, token-weighted voting, proposal execution      |
| **4 — Compliance** | Q2–Q3 2027 | SEP-12 KYC, World ID, price oracle, PWA, i18n               |
