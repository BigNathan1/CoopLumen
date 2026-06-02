# CoopLumen — Product Requirements Document

**Version:** 0.1  
**Status:** Draft  
**Authors:** CoopLumen Core Team  
**Last Updated:** 2026-05-13

---

## Table of Contents

1. [Summary](#1-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [Target Users](#4-target-users)
5. [Core Features](#5-core-features)
6. [Architecture Overview](#6-architecture-overview)
7. [User Stories](#7-user-stories)
8. [Roadmap](#8-roadmap)
9. [Success Metrics](#9-success-metrics)
10. [Non-Goals](#10-non-goals)
11. [Open Questions](#11-open-questions)

---

## 1. Summary

CoopLumen is an open-source, decentralized community finance network built on the Stellar blockchain. It allows any group — a cooperative, NGO, diaspora network, or local savings circle — to issue its own community token, manage a shared treasury, offer peer-to-peer micro-loans, and govern collectively through on-chain proposals.

**Mission:** Make decentralized community finance accessible to any group, anywhere, with no prior crypto expertise required.

---

## 2. Problem Statement

### Financial Exclusion at Scale

- 1.4 billion adults globally remain unbanked (World Bank, 2022)
- Community savings groups (ROSCAs, SACCOs, tontines) manage billions informally with no audit trail, no fraud protection, and no interoperability
- NGOs and cooperatives rely on wire transfers with 3–7% fees and 3–5 day settlement times
- Existing DeFi solutions (Ethereum, Solana) are too expensive, too technically complex, or too volatile for everyday community use

### Specific Pain Points

| Group | Problem |
|---|---|
| Local savings circles | No digital record; fraud risk; limited reach |
| Diaspora communities | High remittance fees to send money home |
| NGOs | Grant disbursement is slow, opaque, and auditor-heavy |
| Co-ops | No shared ledger; governance is manual and slow |

---

## 3. Solution Overview

CoopLumen leverages Stellar's strengths — near-zero fees, 3–5 second finality, built-in asset primitives — to give any community a sovereign financial layer:

1. **Community tokens** — Any group issues its own asset (e.g., `ECOLGS` for Eco Lagos), redeemable within the community
2. **Shared treasury** — Multi-sig distributor accounts hold and disburse community funds transparently
3. **P2P micro-lending** — Members can offer and request loans settled in community tokens or XLM, with on-chain repayment tracking
4. **On-chain governance** — (Phase 3) Soroban smart contracts power proposal voting weighted by token holding and reputation
5. **Simple UX** — Next.js dashboard + Freighter wallet; no private key management by users

---

## 4. Target Users

### Primary

| Persona | Description | Key Need |
|---|---|---|
| **Community Treasurer** | Manages a savings group or co-op fund | Issue token, disburse funds, view audit trail |
| **Community Member** | Holds community token, requests loans | View balance, apply for loan, repay on-chain |
| **NGO Administrator** | Distributes grants to beneficiary groups | Register communities, batch-disburse tokens |

### Secondary

| Persona | Description |
|---|---|
| **Developer / Integrator** | Builds on CoopLumen APIs |
| **Governance Participant** | (Phase 3) Votes on proposals via token-weighted governance |
| **Auditor** | Views immutable on-chain transaction history |

---

## 5. Core Features

### 5.1 On-Chain Asset Issuance

- Community admin generates or imports a Stellar keypair for the issuer account
- System creates a custom asset (`<CODE>/<ISSUER>`) on Stellar Testnet or Mainnet
- Initial supply is sent to a community distributor account (multi-sig in Phase 2)
- Asset metadata stored in PostgreSQL for fast querying
- **Acceptance criteria:**
  - [ ] Asset appears on Stellar Explorer after issuance
  - [ ] Distributor account balance reflects initial supply
  - [ ] Community record created in DB with correct `asset_code` and `asset_issuer`

### 5.2 Trustline Management

- Members must establish a trustline before receiving community tokens
- Backend provides a signed trustline transaction, or builds unsigned XDR for Freighter signing
- Trustline limit is configurable per community policy
- **Acceptance criteria:**
  - [ ] Member account can receive and hold community token after trustline
  - [ ] `hasTrustline()` correctly returns `true`/`false`

### 5.3 Community Wallet Management

- Dashboard shows all balances for connected Freighter wallet
- Members can view community token balance alongside XLM
- Balance refreshes every 15 seconds via SWR
- **Acceptance criteria:**
  - [ ] Freighter connection persists across page refreshes (via local state)
  - [ ] Balances load within 2 seconds on testnet

### 5.4 Peer-to-Peer Lending _(Phase 2)_

- Member submits loan request (amount, asset, due date)
- Another member accepts and funds the loan; on-chain payment is recorded
- Repayment tracked both on-chain and in PostgreSQL
- Reputation score updated on repayment or default
- **Acceptance criteria:**
  - [ ] Loan flow completes end-to-end on testnet
  - [ ] Default status updates automatically when `due_at` passes without repayment

### 5.5 Governance & Reputation _(Phase 3)_

- Token-weighted proposals via Soroban smart contracts
- Proposal types: treasury disbursement, member admission, rule change
- Reputation score (integer) stored off-chain, influenced by: repayment history, tenure, participation
- **Acceptance criteria:**
  - [ ] Proposal created and vote tallied correctly on-chain
  - [ ] Reputation scores visible in member profiles

### 5.6 Identity & KYC Integration _(Phase 4)_

- SEP-12 KYC integration with anchor providers
- Optional World ID / Proof of Humanity gate for governance
- On-chain attestation for verified communities

---

## 6. Architecture Overview

### Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14 (App Router), TypeScript | SSR/SSG, strong typing, ecosystem |
| Wallet | Freighter browser extension | Stellar-native, widely used |
| Backend | Node.js 20, Express 4, TypeScript | Familiar ecosystem, strong typing |
| Blockchain | Stellar SDK, Horizon REST API | Near-zero fees, fast finality |
| Database | PostgreSQL 16 | Off-chain metadata, complex queries |
| Containers | Docker, Docker Compose | Reproducible dev environment |
| Testing | Jest, ts-jest, @testing-library/react | Unit and integration coverage |

### Data Flow

```
User action (e.g., Request loan)
  └─► Freighter signs XDR transaction (client-side)
        └─► Backend validates & submits to Horizon
              └─► Stellar Network settles (~4s)
                    └─► Backend records metadata to PostgreSQL
                          └─► Frontend re-fetches via SWR
```

### Security Principles

- No private keys ever stored server-side for user wallets
- Community distributor keys stored encrypted (Phase 2: multi-sig threshold)
- All user-facing mutations require signed Stellar transactions — no privileged backend bypass
- API inputs validated with `express-validator` before processing
- Helmet.js CSP and CORS headers enforced

---

## 7. User Stories

### Community Setup

```
As a community treasurer,
I want to register my community and issue a custom token,
so that members have a shared digital currency to transact with.

Acceptance criteria:
- Community name and asset code are unique
- Token appears on testnet after issuance API call
- Treasurer receives confirmation with transaction hash
```

```
As a community member,
I want to connect my Freighter wallet and establish a trustline,
so that I can receive community tokens.

Acceptance criteria:
- Freighter connect button opens wallet popup
- Trustline transaction built and signed by wallet
- Balance panel shows 0 TOKENCODE after trustline
```

### Treasury Operations

```
As a community treasurer,
I want to disburse tokens to multiple members at once,
so that grant funds reach beneficiaries efficiently.

Acceptance criteria:
- Batch payment operation sends to up to 100 members per transaction
- Each member balance updates on dashboard within 15s
```

### Lending (Phase 2)

```
As a community member,
I want to apply for a micro-loan in my community's token,
so that I can cover short-term expenses without leaving my community.

Acceptance criteria:
- Loan application requires: amount, purpose, repayment date
- Loan status is visible to lender and borrower
- Repayment triggers on-chain transfer and status update to "repaid"
```

### Governance (Phase 3)

```
As a token holder,
I want to vote on treasury proposals,
so that the community governs its funds democratically.

Acceptance criteria:
- Voting weight = token balance at proposal creation snapshot
- Proposal passes when quorum (>50% of supply) votes "yes"
- Result recorded on-chain via Soroban contract
```

---

## 8. Roadmap

### Phase 1 — Foundation _(current)_
> Target: Q3 2026

- [x] Monorepo scaffold (Next.js + Express + Docker)
- [x] Stellar SDK integration (asset issuance, trustlines, payments)
- [x] Community registration and member management API
- [x] Balance dashboard with Freighter wallet integration
- [x] Linting, type-checking, Jest test setup
- [ ] Testnet end-to-end community creation walkthrough
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Deployed staging environment

### Phase 2 — P2P Lending
> Target: Q4 2026

- [ ] Loan request and acceptance flow
- [ ] On-chain repayment tracking
- [ ] Reputation scoring system
- [ ] Multi-sig distributor accounts
- [ ] Batch disbursement API
- [ ] Mobile-responsive UI improvements

### Phase 3 — DAO Governance
> Target: Q1 2027

- [ ] Soroban smart contract for proposal voting
- [ ] Token-weighted governance with snapshot mechanism
- [ ] Proposal types: disbursement, membership, rule changes
- [ ] On-chain governance UI

### Phase 4 — Identity, KYC & Oracles
> Target: Q2–Q3 2027

- [ ] SEP-12 KYC integration
- [ ] Decentralized identity (World ID / Proof of Humanity)
- [ ] Price oracle integration (XLM/USD for loan valuation)
- [ ] Cross-border remittance corridors via Stellar anchor network

---

## 9. Success Metrics

| Metric | Phase 1 Target | Phase 2 Target |
|---|---|---|
| Registered communities | 10 (testnet) | 100 (mainnet) |
| Active wallets | 50 | 1,000 |
| On-chain transaction volume | 1,000 tx | 50,000 tx |
| GitHub contributors | 5 | 25 |
| Open issues resolved | 20 | 100 |
| Test coverage | ≥ 70% | ≥ 80% |

---

## 10. Non-Goals

The following are explicitly **out of scope** for Phase 1:

- Mobile native apps (React Native / Flutter)
- Fiat on-ramp / off-ramp
- Interest rate calculation or loan risk scoring
- Multi-language i18n support
- Mainnet deployment (Phase 1 targets Testnet only)
- Real-money handling of any kind

---

## 11. Open Questions

| # | Question | Owner | Due |
|---|---|---|---|
| 1 | Should community keys be custodied by the platform or always user-held? | Core Team | Phase 2 planning |
| 2 | What is the minimum viable governance mechanism — weighted voting or simple majority? | Community | Phase 3 planning |
| 3 | Which SEP-12 anchor should we recommend for KYC in Phase 4? | Partnerships | Phase 3 complete |
| 4 | Should the reputation score be on-chain or off-chain? | Core Team | Phase 2 design |
