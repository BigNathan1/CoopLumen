# StellarCommons

> **Decentralized community finance on the Stellar blockchain — open source, contributor-first.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org)
[![Stellar](https://img.shields.io/badge/Stellar-Testnet%2FMainnet-blueviolet)](https://stellar.org)

---

## Why StellarCommons?

Traditional finance excludes billions of people through geographic barriers, credit requirements, and prohibitive fees. StellarCommons uses the Stellar network — with its 5-second finality, near-zero fees, and built-in DEX — to give any group (NGO, cooperative, local community, diaspora network) the tools to issue community tokens, run peer-to-peer lending pools, and govern shared treasuries without a bank in the middle.

Why Stellar specifically?

- **Speed & cost**: Transactions settle in 3–5 seconds for fractions of a cent
- **Built-in asset primitives**: Native support for custom assets, trustlines, and multi-sig
- **Soroban smart contracts**: Path to on-chain governance in Phase 3
- **Freighter wallet**: Mature browser extension for end-user signing

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / PWA                         │
│   Next.js 14 (App Router)  ·  Freighter Wallet Extension    │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST (JSON)
┌───────────────────────────▼─────────────────────────────────┐
│              Node.js / Express API  (port 4000)              │
│   /api/communities   /api/tokens   /api/balances             │
│                                                              │
│   ┌──────────────────┐   ┌──────────────────────────────┐   │
│   │  /contracts      │   │  PostgreSQL (off-chain meta) │   │
│   │  assets.ts       │   │  communities · members       │   │
│   │  trustlines.ts   │   │  loans                       │   │
│   │  transactions.ts │   └──────────────────────────────┘   │
│   └────────┬─────────┘                                       │
└────────────┼────────────────────────────────────────────────┘
             │ Stellar SDK (Horizon REST)
┌────────────▼────────────────────────────────────────────────┐
│              Stellar Network (Testnet / Mainnet)              │
│        Horizon API · Asset issuance · Trustlines             │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
stellarcommons/
├── backend/                  # Node.js / Express API
│   ├── src/
│   │   ├── api/
│   │   │   ├── middleware/   # errorHandler, notFound
│   │   │   └── routes/       # communities, tokens, balances
│   │   ├── contracts/        # Stellar SDK wrappers
│   │   │   ├── assets.ts     # Asset issuance
│   │   │   ├── trustlines.ts # Trustline management
│   │   │   ├── transactions.ts # Payment building & submission
│   │   │   └── stellar.ts    # Horizon server singleton
│   │   ├── db/               # PostgreSQL pool & migrations
│   │   └── utils/            # Logger
│   ├── Dockerfile
│   └── package.json
├── frontend/                 # Next.js 14 (App Router)
│   ├── src/
│   │   ├── app/              # Routes, layout, global CSS
│   │   ├── components/       # Dashboard, WalletConnect, CommunityCard, BalancePanel
│   │   └── hooks/            # useWallet, useCommunities, useBalances
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── README.md
├── PRD.md
└── CONTRIBUTING.md
```

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v24+)
- [Node.js](https://nodejs.org) 20+ (for local development without Docker)
- [Freighter wallet](https://freighter.app) browser extension

### 1. Clone

```bash
git clone https://github.com/yourname/stellarcommons.git
cd stellarcommons
```

### 2. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env.local
```

Edit `backend/.env` to set your Stellar keys and network preference.

### 3. Start with Docker (recommended)

```bash
docker-compose up
```

This starts:
- PostgreSQL on `localhost:5432`
- Backend API on `localhost:4000`
- Frontend on `localhost:3000`

### 4. Run database migrations

```bash
docker-compose exec backend npm run db:migrate
```

### 5. Open the app

Navigate to [http://localhost:3000](http://localhost:3000) and connect Freighter.

---

## Local Development (without Docker)

```bash
# Terminal 1 — Backend
cd backend
npm install
npm run dev          # starts ts-node-dev on :4000

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev          # starts Next.js on :3000
```

You will need a local PostgreSQL instance. Set `DATABASE_URL` in `backend/.env`.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | API server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `STELLAR_NETWORK` | `testnet` | `testnet` or `mainnet` |
| `STELLAR_HORIZON_URL` | Testnet Horizon | Override Horizon endpoint |
| `FRONTEND_URL` | `http://localhost:3000` | CORS allowed origin |
| `LOG_LEVEL` | `info` | winston log level |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Backend API base URL |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `TESTNET` | Network shown in UI |

---

## API Reference

### Communities

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/communities` | List all communities |
| `GET` | `/api/communities/:id` | Get a single community |
| `POST` | `/api/communities` | Register a new community |
| `GET` | `/api/communities/:id/members` | List community members |
| `POST` | `/api/communities/:id/members` | Add a member |

### Tokens

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tokens/issue` | Issue community token on Stellar |
| `POST` | `/api/tokens/trustline` | Establish trustline for a member |

### Balances

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/balances/:publicKey` | Get all balances for an account |
| `GET` | `/api/balances/:publicKey/loans` | Get loans for an account |
| `GET` | `/api/balances/community/:id/loans` | Get all loans in a community |

### Health

```
GET /health  →  { "status": "ok", "version": "0.1.0" }
```

---

## Example: Register a community via cURL

```bash
curl -X POST http://localhost:4000/api/communities \
  -H "Content-Type: application/json" \
  -d '{
    "name": "EcoDAO Lagos",
    "description": "Eco-finance cooperative for Lagos community",
    "issuerPublicKey": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "assetCode": "ECOLGS",
    "assetIssuer": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  }'
```

---

## Testing

```bash
# Backend
cd backend && npm test
cd backend && npm run test:coverage

# Frontend
cd frontend && npm test
```

---

## Links

- [Product Requirements Document](PRD.md) — goals, roadmap, user stories
- [Contributing Guide](CONTRIBUTING.md) — branch model, conventions, code review

## Community

- GitHub Discussions: [github.com/yourname/stellarcommons/discussions](https://github.com/yourname/stellarcommons/discussions)
- Discord: _coming soon_
- Stellar Developers: [discord.gg/stellar](https://discord.gg/stellar)

---

## License

MIT © StellarCommons Contributors
