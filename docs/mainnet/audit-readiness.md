# CoopLumen Security Audit Readiness

**Version:** 0.1  
**Last Updated:** 2026-05-20  
**Status:** Prepared for independent security review

---

## Table of Contents

1. [Audit Scope](#audit-scope)
2. [Architecture & Trust Boundaries](#architecture--trust-boundaries)
3. [Security Controls Inventory](#security-controls-inventory)
4. [Smart Contract Security](#smart-contract-security)
5. [Backend API Security](#backend-api-security)
6. [Frontend Security](#frontend-security)
7. [Threat Model](#threat-model)
8. [Known Limitations & Outstanding Risks](#known-limitations--outstanding-risks)
9. [Security Testing Evidence](#security-testing-evidence)
10. [External Audit Engagement](#external-audit-engagement)

---

## Audit Scope

CoopLumen is a decentralized community finance platform built on the Stellar network. This audit covers:

### In Scope

**Smart Contracts:**

- Soroban governance contract (`contracts/governance/src/lib.rs`)
  - Authorization controls and role-based access
  - Proposal creation, voting, and execution
  - Admin transfer and contract upgrade mechanisms
  - Pause and delegation logic

**Backend API:**

- Authentication and session management (`backend/src/api/middleware/auth.ts`)
- Authorization and role-based access control
- Asset issuance and trustline management (`backend/src/contracts/assets.ts`, `trustlines.ts`)
- Transaction handling (`backend/src/contracts/transactions.ts`)
- Input validation and error handling
- Stellar SDK integration and network communication
- Webhook signature verification
- Rate limiting and DOS protection

**Frontend:**

- Wallet connection and signature handling
- Session token management
- User input validation
- Secure credential handling

**Infrastructure:**

- Environment variable management and secrets
- Docker and deployment configurations
- CI/CD pipeline security

### Out of Scope

- Freighter wallet implementation (third-party)
- Stellar core network security (third-party)
- Horizon API security (third-party)
- Third-party service integrations (KYC providers, market data feeds)

---

## Architecture & Trust Boundaries

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Frontend (Next.js + React)                     │
│  ├─ Freighter Wallet Integration                            │
│  ├─ Session Token (httpOnly cookie)                         │
│  └─ User Input Validation                                   │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS REST API
┌───────────────▼─────────────────────────────────────────────┐
│           Backend API (Node.js / Express)                   │
│  ├─ Authentication (Freighter challenge/verify)             │
│  ├─ Authorization (RBAC: admin/treasurer/member/observer)   │
│  ├─ Rate Limiting & Webhook Validation                      │
│  ├─ Stellar Contracts Layer (SDK)                           │
│  └─ Database Layer (PostgreSQL with parameterized queries) │
└───────────────┬─────────────────────────────────────────────┘
                │ Parameterized SQL
┌───────────────▼─────────────────────────────────────────────┐
│         PostgreSQL Database                                 │
│  ├─ Communities & Members                                   │
│  ├─ Assets & Trustlines (metadata)                          │
│  └─ Loans & Transaction History                             │
└─────────────────────────────────────────────────────────────┘
                │
                │ Stellar SDK (HTTPS)
┌───────────────▼─────────────────────────────────────────────┐
│    Stellar Testnet / Mainnet                                │
│  ├─ Asset Issuance & Management                             │
│  ├─ Trustlines & Balances                                   │
│  ├─ Governance Contract (Soroban)                           │
│  └─ Transaction Submission & Verification                   │
└─────────────────────────────────────────────────────────────┘
```

### Trust Boundaries

| Boundary                              | Description                                        |
| ------------------------------------- | -------------------------------------------------- |
| Frontend ↔ Backend (HTTPS)            | Authenticated via session token; CORS validated    |
| Backend ↔ Database (TCP)              | Local network; parameterized queries only          |
| Backend ↔ Stellar (HTTPS)             | Public API; transaction verification via signature |
| Server ↔ Wallet (Client-side signing) | Private keys never sent to backend                 |

### Privileged Roles

| Role      | Scope                       | Authority           |
| --------- | --------------------------- | ------------------- |
| Admin     | Server-wide; operator only  | ADMIN_ADDRESSES env |
| Treasurer | Community-specific          | Community role DB   |
| Member    | Community member read/write | Community role DB   |
| Observer  | Community read-only         | Community role DB   |

---

## Security Controls Inventory

### A. Authentication

| Control                          | Implementation                                       |
| -------------------------------- | ---------------------------------------------------- |
| **Wallet-based auth**            | Freighter wallet signs message; server verifies      |
| **Challenge-response**           | 32-byte random nonce per request; TTL 5 minutes      |
| **Session tokens**               | JWT signed with AUTH_SESSION_SECRET; HttpOnly cookie |
| **Token expiry**                 | Configured per deployment; default 7 days            |
| **Double submission protection** | Token contains nonce; reuse invalidated              |

**Location:** `backend/src/api/routes/auth.ts`, `backend/src/api/utils/sessionToken.ts`

### B. Authorization

| Control                 | Implementation                                       |
| ----------------------- | ---------------------------------------------------- |
| **RBAC**                | requireRole() middleware checks community membership |
| **Admin gating**        | requireAdmin() reads ADMIN_ADDRESSES at startup      |
| **Role inheritance**    | None; roles are flat (admin, treasurer, member)      |
| **Least privilege**     | Default deny; empty ADMIN_ADDRESSES blocks all ops   |
| **Community isolation** | Queries filtered by community_id + stellar_address   |

**Location:** `backend/src/api/middleware/auth.ts`, `backend/src/db/`

### C. Input Validation

| Control                      | Implementation                                      |
| ---------------------------- | --------------------------------------------------- |
| **Schema validation**        | Zod schemas per route; type-safe at compile time    |
| **Boundary validation**      | Public keys, asset codes, amounts validated at API  |
| **SQL injection prevention** | Parameterized queries only; no raw SQL construction |
| **XSS prevention**           | Helmet CSP headers; React default escaping          |

**Location:** `backend/src/api/schemas/`, `backend/src/api/middleware/validate.ts`

### D. Transaction Security

| Control                      | Implementation                                        |
| ---------------------------- | ----------------------------------------------------- |
| **Signature verification**   | All Stellar transactions verified by network          |
| **Nonce / sequence number**  | Stellar sequence cache prevents replay                |
| **Memo/metadata validation** | Text and ID memos validated; base64 allowed           |
| **Idempotency**              | Stellar TX hash as key; duplicate submission rejected |
| **Fee validation**           | BASE_FEE (100 stroops) standard; no dynamic pricing   |

**Location:** `backend/src/contracts/transactions.ts`, `backend/src/contracts/sequenceCache.ts`

### E. Secrets Management

| Control                   | Implementation                                         |
| ------------------------- | ------------------------------------------------------ |
| **Private key handling**  | Never logged; only in memory during TX signing         |
| **Environment variables** | Loaded from .env; never committed; required at startup |
| **Webhook secrets**       | HMAC-SHA256 verification on incoming requests          |
| **Session secret**        | Random bytes; never exposed in logs or responses       |

**Location:** `backend/src/index.ts` (env validation), middleware stack

### F. Rate Limiting

| Control                    | Implementation                                        |
| -------------------------- | ----------------------------------------------------- |
| **Per-route limits**       | express-rate-limit configured per endpoint            |
| **Per-IP tracking**        | Redis-backed (falls back to in-process)               |
| **Slow-down**              | express-slow-down increases response time after limit |
| **Health check exemption** | GET /health not rate-limited to allow monitoring      |

**Location:** `backend/src/api/middleware/rateLimit.ts`, `backend/src/cache/`

### G. Error Handling

| Control                   | Implementation                                        |
| ------------------------- | ----------------------------------------------------- |
| **No secret leakage**     | Error messages generic; stack traces logged only      |
| **HTTP status codes**     | 401 auth, 403 authz, 409 conflict, 500 server errors  |
| **CORS headers**          | FRONTEND_URL validated; OPTIONS requests allowed      |
| **Webhook error logging** | Invalid signatures logged; requests rejected with 403 |

**Location:** `backend/src/api/middleware/errorHandler.ts`

### H. Network Configuration

| Control               | Implementation                                     |
| --------------------- | -------------------------------------------------- |
| **Network selection** | STELLAR_NETWORK env var; validated at startup      |
| **Horizon URL**       | Configurable per environment; defaults to official |
| **HTTPS only**        | All Stellar communication via HTTPS                |
| **Retry logic**       | Exponential backoff on transient failures          |

**Location:** `backend/src/contracts/stellar.ts`, `backend/src/index.ts`

---

## Smart Contract Security

### Governance Contract (`contracts/governance/src/lib.rs`)

#### Authorization Controls

**Implemented:**

- `initialize()` — Only callable once; populates config and grants admin all roles
- `grant_role()` / `revoke_role()` — Requires actor auth and appropriate admin/role holder status
- `create_proposal()` — Requires proposer auth; no role check (any token holder can propose)
- `cast_vote()` — Requires voter auth; consults governance token balances
- `execute_proposal()` — Requires executor auth; verifies proposal passed and quorum met
- Role-based access — `Pause`, `Schema`, `Issuer`, `Revocation`, `Upgrade`, `Recovery` roles

**Design:**

- Role assignment is the single gate for each operation family
- Admin can delegate operational roles; `Upgrade` and `Recovery` require admin
- Failed operations leave no partial state behind (guards run before writes)

#### Vote Integrity

**Implemented:**

- **Double-vote prevention:** `VoteUsed(proposal_id, voter)` key marks address as voted
- **Balance checking:** Voter balance loaded at vote time; zero balance rejected
- **Delegation integrity:** One-hop only; cycles prevented; delegators cannot vote directly
- **Voting window:** Votes rejected after `voting_ends_at` timestamp
- **Vote weight:** Voter balance + delegated balance from all delegators counted once

**Design:**

- Delegators resolved when ballot is cast, not when delegation made (reflects token transfers)
- Undelegation does not retroactively invalidate prior votes
- Tally is final once voting period closes

#### Proposal Lifecycle

**States:** `Active` → `Passed` | `Rejected` | `Executed`

**Implemented:**

- `Active` — New proposals start here; voting happens
- `Passed` — Finalized when `votes_for > votes_against` after voting window
- `Rejected` — Finalized when `votes_against >= votes_for` after voting window
- `Executed` — Terminal state after `execute_proposal()` called on passed proposal
- Quorum requirement — `execute_proposal()` checks participation >= `quorum_bps`

**Design:**

- Finalization and execution are separate (proposal can be finalized but not yet executed)
- Incident pause can prevent proposal creation but not finalization/execution (incident won't strand proposals)

#### Known Limitations

| Limitation                                    | Impact                                            | Mitigation                             |
| --------------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| **Actions are opaque strings**                | No on-chain execution; off-chain parser required  | Document action schema; audit executor |
| **No cross-contract calls**                   | Governance cannot directly invoke other contracts | Off-chain execution required           |
| **No recurring proposals**                    | Governance cannot schedule operations             | Document manual renewal if needed      |
| **No veto or delegation revocation by admin** | Delegations persist until delegator revokes       | Users must actively manage delegations |

---

## Backend API Security

### Authentication Route

**Endpoint:** `POST /api/v1/auth/verify`

**Flow:**

1. Client calls without auth → receives challenge (32-byte random nonce)
2. Client signs challenge with Freighter
3. Client submits signed envelope to verify
4. Backend verifies signature against recovered public key
5. Backend issues session JWT signed with AUTH_SESSION_SECRET

**Validation:**

- Signature verified using Stellar SDK (recovers public key from signature)
- Nonce is random; new challenge per request
- Challenge expires after 5 minutes (TTL enforced client-side; server-side optional)
- Session token is HttpOnly, Secure, SameSite=Strict cookie

**Location:** `backend/src/api/routes/auth.ts`

### Authorization Middleware

**`requireAuth()` middleware:**

- Extracts session token from HttpOnly cookie OR Authorization header
- Verifies token signature and expiry
- Populates `req.auth.address` from token
- Returns 401 if missing or invalid

**`requireRole(roles)` middleware:**

- Requires auth to run first
- Queries DB for membership in community (parsed from `:id` param)
- Validates caller is active member (deleted_at IS NULL)
- Validates member holds one of required roles
- Returns 403 if not member or role doesn't match
- Returns 404 if community doesn't exist (timing-safe)

**`requireAdmin()` middleware:**

- Requires auth to run first
- Checks if caller address is in ADMIN_ADDRESSES
- Returns 403 if not in list

### Input Validation

**Schema validation via Zod:**

```
POST /api/v1/tokens/build-issue
  ├─ issuerPublicKey: string (Stellar public key)
  ├─ assetCode: string (1-12 chars, alphanumeric)
  ├─ distributorPublicKey: string (Stellar public key)
  └─ initialSupply: string (positive decimal)
```

**Boundary checks:**

- Public keys validated via Stellar SDK (Keypair.isValidPublicKey)
- Asset codes validated (length, characters)
- Amounts validated (positive, within Stellar limits)
- UUIDs validated before querying database

**Location:** `backend/src/api/schemas/`, `backend/src/contracts/validation.ts`

### Transaction Submission

**Security properties:**

- Transactions signed by client or server (never submitted unsigned)
- Sequence numbers fetched fresh per TX (prevents replay)
- Memo validated (text, ID, or base64)
- Time bounds validated (not expired, reasonable future)
- Duplicate submission detected via TX hash idempotency

**Error handling:**

- Failed submissions logged (no private key exposure)
- User receives error code, not internal details
- Retryable errors (429, 503) trigger exponential backoff

### Webhook Signature Verification

**Stellar callback webhooks:**

- POST `/api/v1/webhooks/stellar` expects HMAC-SHA256 signature in header
- Signature verified against STELLAR_WEBHOOK_SECRET
- Invalid signatures rejected with 403 (no attempt to proceed)
- Request body used as-is for HMAC (no additional encoding)

**KYC webhooks:**

- POST `/api/v1/webhooks/kyc` expects separate HMAC-SHA256 signature
- Uses KYC_WEBHOOK_SECRET (different from Stellar webhook secret)
- Same validation and rejection logic

---

## Frontend Security

### Wallet Connection

**Security model:**

- Private keys remain in Freighter (browser extension)
- Backend never sees private keys
- All signing done in Freighter (client controls all signatures)
- Unsigned transactions built by backend; signed by frontend

### Session Token

**Storage:**

- Stored in HttpOnly, Secure, SameSite=Strict cookie (cannot access via JavaScript)
- Set-Cookie header includes SameSite=Strict (CSRF mitigation)
- Expires after configured TTL (default 7 days)

### Content Security Policy

**Helmet.js configuration:**

- CSP headers prevent inline script execution
- X-Frame-Options: DENY (no framing)
- X-Content-Type-Options: nosniff (disable MIME sniffing)
- Referrer-Policy: no-referrer (no referrer leakage)

### Input Handling

**User-submitted data:**

- React default escaping prevents XSS
- Zod schemas validate on client (client-side validation only; server re-validates)
- URLs validated before use (prevents javascript: protocol)
- No innerHTML; only text content and controlled components

### Error Handling

**Error messages:**

- Generic error messages to user ("Operation failed")
- Detailed errors logged in browser console (developer-only)
- No sensitive data in error toasts (no stack traces, no API responses)

---

## Threat Model

### Asset Protection

**Asset:** Community tokens on-chain

| Threat                        | Likelihood | Severity | Mitigation                                    |
| ----------------------------- | ---------- | -------- | --------------------------------------------- |
| Unauthorized token issuance   | Low        | Critical | Only issuer can issue; auth required          |
| Double-spending               | Very Low   | Critical | Stellar ledger enforces ordering              |
| Account takeover (issuer key) | Medium     | Critical | Client-side signing; cold storage recommended |
| Invalid balance queries       | Low        | High     | Query Horizon; verify with ledger             |

### Governance Integrity

**Asset:** Proposal voting results

| Threat                          | Likelihood | Severity | Mitigation                                  |
| ------------------------------- | ---------- | -------- | ------------------------------------------- |
| Double voting                   | Very Low   | Critical | VoteUsed key per proposal prevents re-vote  |
| Vote manipulation               | Very Low   | Critical | Stellar ledger immutable; contract verifies |
| Unauthorized proposal execution | Low        | High     | Requires executor auth + quorum check       |
| Delegation bypass               | Low        | High     | One-hop only; cycles prevented              |

### Authentication & Authorization

**Asset:** User sessions and administrative access

| Threat                            | Likelihood | Severity | Mitigation                                 |
| --------------------------------- | ---------- | -------- | ------------------------------------------ |
| Session token forgery             | Very Low   | High     | HMAC-SHA256 signature with secret          |
| Unauthorized admin action         | Medium     | High     | ADMIN_ADDRESSES must be explicitly set     |
| RBAC bypass                       | Low        | High     | requireRole checks membership on each call |
| Cross-site request forgery (CSRF) | Low        | High     | HttpOnly, SameSite=Strict cookies          |

### Data Confidentiality

**Asset:** User private keys and sensitive data

| Threat                       | Likelihood | Severity | Mitigation                             |
| ---------------------------- | ---------- | -------- | -------------------------------------- |
| Private key logging          | Very Low   | Critical | Code review; lint for logging patterns |
| Session token exposure       | Low        | High     | HttpOnly, Secure, SameSite cookies     |
| Password re-use (user issue) | Medium     | Medium   | Educate users; no password handling    |

### Data Integrity

**Asset:** Loan and community records

| Threat                              | Likelihood | Severity | Mitigation                               |
| ----------------------------------- | ---------- | -------- | ---------------------------------------- |
| SQL injection                       | Very Low   | Critical | Parameterized queries only               |
| Unauthorized community modification | Low        | High     | requireRole checks before updates        |
| Loan record tampering               | Low        | High     | Database ACLs; audit logs in application |

### Availability

**Asset:** Service uptime and responsiveness

| Threat                      | Likelihood | Severity | Mitigation                                 |
| --------------------------- | ---------- | -------- | ------------------------------------------ |
| DOS via rate limiting       | Medium     | Medium   | Rate limits per endpoint; slowdown backoff |
| Contract deployment failure | Medium     | High     | Deploy scripts tested; manual approval     |
| Stellar network outage      | Low        | High     | Retry logic; health check monitoring       |

---

## Known Limitations & Outstanding Risks

### High-Priority (Must Address Before Mainnet Launch)

| Issue                                   | Description                                         | Current Status          |
| --------------------------------------- | --------------------------------------------------- | ----------------------- |
| **External audit not yet commissioned** | Security review is internal; audit firm TBD         | Scheduled for Phase 2   |
| **ADMIN_ADDRESSES not set in prod**     | Operator routes fail open if env var not configured | Now required at startup |
| **AUTH_SESSION_SECRET not required**    | Falls back to insecure default in non-prod          | Now required in prod    |

### Medium-Priority (Recommend Before Production)

| Issue                                 | Description                                        | Current Status          |
| ------------------------------------- | -------------------------------------------------- | ----------------------- |
| **Actions are opaque strings**        | Governance contract actions are off-chain executed | Documented limitation   |
| **No contract upgrade mechanism**     | Mainnet deployments immutable after first deploy   | Planned for Phase 3     |
| **Key management not HSM-integrated** | Issuer keys managed application-side (not ideal)   | Document best practices |
| **Single admin account**              | No multi-sig for critical operations yet           | Phase 2 capability      |

### Low-Priority (Operational)

| Issue                                 | Description                                   | Current Status               |
| ------------------------------------- | --------------------------------------------- | ---------------------------- |
| **Testnet/Mainnet data leak risk**    | Manual process to avoid mixing networks       | Environment validation       |
| **Rate limits may be too permissive** | Monitor real usage to calibrate               | Baseline set; adjust in prod |
| **No automatic incident response**    | Pause mechanism requires manual authorization | By design (no automation)    |

---

## Security Testing Evidence

### Backend Unit & Integration Tests

**Location:** `backend/src/__tests__/`

**Tested:**

- Session token generation, verification, and expiry
- RBAC (requireRole guards correct roles)
- Admin authorization (requireAdmin checks ADMIN_ADDRESSES)
- Input validation (Zod schemas, public key validation)
- Transaction building and submission retry logic
- Database query isolation (community_id filtering)
- Error handling (no secret leakage in responses)

**Test coverage:** ≥ 70% line coverage in production code (enforced in CI)

### Smart Contract Tests

**Location:** `contracts/governance/tests/`

**Tested:**

- Vote counting and finalization
- Double-vote prevention
- Delegation cycles and self-delegation rejection
- Admin transfer and role management
- Pause mechanism
- Authorization guards on privileged operations

### End-to-End Tests

**Location:** `frontend/e2e/`

**Tested:**

- Freighter wallet connection
- Session token issuance and refresh
- Community creation and membership
- Token issuance and transfer workflows
- Proposal creation and voting
- Error handling and user feedback

### Dependency Scanning

**Tool:** `npm audit` (backend + frontend)

**Runs on:** Every CI build; high-severity vulnerabilities fail CI

**Current status:** Passing (all high-severity issues addressed)

### Container Scanning

**Tool:** Trivy (backend + frontend Docker images)

**Runs on:** Every CI build; critical/high OS vulnerabilities fail build

**Current status:** Passing

---

## External Audit Engagement

### Audit Scope

**Recommended focus areas:**

1. **Smart contract authorization and vote integrity**
   - Verify delegation logic prevents cycles
   - Verify double-voting is impossible
   - Verify proposal lifecycle state machine
   - Verify role-based access controls

2. **Backend API authentication and authorization**
   - Verify session token generation and validation
   - Verify RBAC guards against unauthorized actions
   - Verify SQL injection protection (parameterized queries)
   - Verify rate limiting effectiveness

3. **Transaction handling and idempotency**
   - Verify duplicate submissions are rejected
   - Verify sequence number management
   - Verify signature verification
   - Verify time bounds enforcement

4. **Secrets and configuration management**
   - Verify private keys are not logged
   - Verify environment variable handling
   - Verify webhook secret verification
   - Verify Mainnet/Testnet separation

5. **Wallet integration and frontend security**
   - Verify Freighter integration does not expose private keys
   - Verify CSP and CORS headers are correct
   - Verify session tokens are HttpOnly
   - Verify user input validation prevents XSS

### Recommended Auditor Profile

- **Experience:** Stellar ecosystem (SDK, Soroban, asset primitives)
- **Background:** Smart contract security + web API security
- **Certification:** Preferred — Certora, Trail of Bits, OpenZeppelin, or equivalent
- **Timeline:** 2–4 weeks for Phase 1 (contract + API)

### Deliverables Expected

1. Security audit report identifying:
   - Vulnerabilities by severity (Critical, High, Medium, Low, Informational)
   - Root cause and exploitability
   - Recommended fixes

2. Verified fixes and retesting

3. Sign-off and audit completion certificate (if applicable to auditor)

### Timeline & Budget

| Phase       | Effort        | Timeline       |
| ----------- | ------------- | -------------- |
| Scope & RFP | 1 week        | May 27 – Jun 3 |
| Audit       | 2–4 weeks     | Jun 3 – Jun 24 |
| Fixes       | 1–2 weeks     | Jun 24 – Jul 8 |
| Retest      | 1 week        | Jul 8 – Jul 15 |
| **Total**   | **5–9 weeks** | **May – July** |

**Estimated budget:** $15,000 – $40,000 USD (varies by firm and scope)

### Security Audit Checklist for Engagement

- [ ] Audit firm selected and contract signed
- [ ] Audit scope finalized
- [ ] CoopLumen source code provided (private repo access or tarball)
- [ ] Stellar Testnet account provided for auditor testing (if needed)
- [ ] Questions answered; initial review phase complete
- [ ] Main audit phase underway (weekly status syncs)
- [ ] Draft report delivered
- [ ] Issues triage and remediation plan agreed
- [ ] Fixes implemented and tested
- [ ] Retest phase complete
- [ ] Final audit report signed off
- [ ] Audit completion date announced

---

## Appendix: References & Further Reading

### Stellar Documentation

- [Stellar Stellar SDK (TypeScript/JavaScript)](https://developers.stellar.org/docs/reference/javascript-sdk)
- [Soroban Smart Contracts](https://developers.stellar.org/docs/learn/soroban)
- [Horizon API](https://developers.stellar.org/api/introduction)

### Security Standards

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

### Related Documents

- `SECURITY.md` — Vulnerability reporting policy
- `CONTRIBUTING.md` — Code review checklist including security
- `docs/governance-contract.md` — Contract interface and errors
- `docs/architecture.md` — System design and data flow

---

**Prepared by:** CoopLumen Core Team  
**For:** Independent security audit engagement  
**Classification:** Public
