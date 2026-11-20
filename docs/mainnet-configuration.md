# Stellar Mainnet Configuration

**Purpose:** Configure CoopLumen for Stellar Mainnet launch  
**Audience:** DevOps, release team, maintainers  
**Prerequisites:** Stellar Mainnet account, issuer account, governance contract deployed

---

## Overview

CoopLumen supports both Stellar Testnet (development) and Stellar Mainnet (production) via the `STELLAR_NETWORK` environment variable. This document describes how to prepare and deploy to Mainnet.

**Key principle:** Never accidentally use Mainnet configuration in a development environment. The configuration is strictly separated, validated at startup, and requires explicit configuration to activate.

---

## Network Separation

### Development (Local)

```bash
# backend/.env (local development)
NODE_ENV=development
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
FRONTEND_URL=http://localhost:3000
AUTH_SESSION_SECRET=dev-secret-123  # Optional in dev; will use fallback
```

**Properties:**
- Uses Stellar Testnet (public Stellart network for testing)
- Horizon URL points to `horizon-testnet.stellar.org`
- Transaction fees are real (100 stroops) but on testnet XLM
- Can request free XLM via Friendbot for testing
- No ADMIN_ADDRESSES required (operator routes simply fail with 403)

### Staging (Optional)

```bash
# backend/.env.staging (pre-production, still on Testnet)
NODE_ENV=staging
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
FRONTEND_URL=https://staging.cooplumen.org
AUTH_SESSION_SECRET=<random-secret-staging>
ADMIN_ADDRESSES=GAAAA...,GBBBB...  # Staging admins
```

**Properties:**
- Replicates production configuration but on Testnet
- Allows testing production workflows without real Mainnet access
- Tests full deployment pipeline, monitoring, and incident response

### Production (Mainnet)

```bash
# backend/.env.production (production on Mainnet)
NODE_ENV=production
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
FRONTEND_URL=https://cooplumen.org
AUTH_SESSION_SECRET=<random-secret-production>
ADMIN_ADDRESSES=G1111...,G2222...  # Production admins
STELLAR_MAINNET_GOVERNANCE_CONTRACT_ID=CAAA...  # Deployed contract address
STELLAR_MAINNET_ISSUER_PUBLIC_KEY=GBBBB...  # Mainnet issuer account
```

**Properties:**
- Uses Stellar Mainnet (real network; transactions permanent)
- Horizon URL points to `horizon.stellar.org` (official public API)
- Transaction fees are real (100 stroops) and in real XLM
- All money is real; reversals impossible
- Requires explicit environment variables; startup fails if missing

---

## Configuration Checklist

### Before Mainnet Deployment

- [ ] **Stellar Network Selected:** `STELLAR_NETWORK=mainnet` explicitly set (not inferred)
- [ ] **Horizon URL Correct:** `STELLAR_HORIZON_URL=https://horizon.stellar.org` (official endpoint)
- [ ] **Auth Secret Set:** `AUTH_SESSION_SECRET` is a random, 32-byte secret (not empty, not default)
- [ ] **Admin Addresses Set:** `ADMIN_ADDRESSES` contains the Mainnet admin public keys (comma-separated)
- [ ] **Issuer Account Ready:** Mainnet issuer account funded and verified (see `mainnet-issuer-setup.md`)
- [ ] **Contract Deployed:** Governance contract deployed to Mainnet; address recorded in `STELLAR_MAINNET_GOVERNANCE_CONTRACT_ID`
- [ ] **No Testnet Artifacts:** All contract addresses, issuer keys, and assets are Mainnet-native
- [ ] **No Placeholder Values:** No configuration values are left as example/placeholder text
- [ ] **Secrets Not in Git:** `.env.production` file is in `.gitignore` and never committed to git
- [ ] **Health Check Passes:** `GET /api/v1/health` returns 200 with all checks passing

### Validation Steps (Manual)

**1. Verify Horizon connectivity:**

```bash
curl https://horizon.stellar.org/
# Expected: 200 OK with API version information
```

**2. Verify network passphrase:**

```bash
curl https://horizon.stellar.org/ledgers/1 | jq '.network_passphrase'
# Expected: "Public Global Stellar Network ; September 2015"
```

**3. Verify issuer account on Mainnet:**

```bash
curl "https://horizon.stellar.org/accounts/GXXXXX...(issuer-public-key)"
# Expected: 200 OK with account details, including non-zero XLM balance
```

**4. Verify governance contract exists:**

```bash
curl "https://horizon.stellar.org/transactions?account_id=CYYY...(contract-id)"
# Expected: 200 OK; if 404, contract not found on this network
```

**5. Health check on deployment:**

```bash
curl http://<deployed-api>/api/v1/health
# Expected: 200 with { "status": "ok", "version": "...", "checks": {...} }
```

---

## Environment Variable Reference

### Required on All Environments

| Variable              | Value                                       | Validation                                  |
| --------------------- | ------------------------------------------- | ------------------------------------------- |
| `STELLAR_NETWORK`     | `testnet` or `mainnet`                      | Must be one of these two values             |
| `STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` (test) OR `https://horizon.stellar.org` (main) | Must be valid HTTPS URL |
| `FRONTEND_URL`        | Frontend origin (e.g., `http://localhost:3000` or `https://cooplumen.org`) | CORS-validated origin |
| `DATABASE_URL`        | PostgreSQL connection string                | Must be valid `postgresql://` DSN           |

### Required in Production (`NODE_ENV=production`)

| Variable              | Value                                       | Validation                                  |
| --------------------- | ------------------------------------------- | ------------------------------------------- |
| `AUTH_SESSION_SECRET` | Random 32+ byte secret (hex or base64)      | Must be non-empty; enforced at startup      |
| `ADMIN_ADDRESSES`     | Comma-separated Stellar public keys         | Must not be empty; enforced at startup      |

### Mainnet-Specific (Optional, used when `STELLAR_NETWORK=mainnet`)

| Variable                             | Value                               | Validation                       |
| ------------------------------------ | ----------------------------------- | -------------------------------- |
| `STELLAR_MAINNET_GOVERNANCE_CONTRACT_ID` | Soroban contract ID (starts with `C`) | Optional; advisory only if set  |
| `STELLAR_MAINNET_ISSUER_PUBLIC_KEY` | Stellar public key (starts with `G`) | Optional; advisory only if set  |

### Optional (Defaulted)

| Variable              | Default                                   | Purpose                                     |
| --------------------- | ----------------------------------------- | ------------------------------------------- |
| `PORT`                | `4000`                                    | API server listen port                      |
| `NODE_ENV`            | `development`                             | Environment mode (development/production)   |
| `LOG_LEVEL`           | `info`                                    | Winston log level                           |
| `REDIS_URL`           | Not set (in-process cache)                | Redis connection; optional for rate limiting |
| `TRUST_PROXY`         | Not set                                   | Reverse proxy hops for X-Forwarded-For      |

---

## Startup Validation

When the backend starts, it performs the following checks:

### All Environments

1. ✅ `STELLAR_NETWORK` is `testnet` or `mainnet`
2. ✅ `STELLAR_HORIZON_URL` is a non-empty string
3. ✅ `FRONTEND_URL` is a non-empty string
4. ✅ `DATABASE_URL` is a non-empty string

If any check fails, the application logs an error and exits with status 1.

### Production (`NODE_ENV=production`) Only

1. ✅ `AUTH_SESSION_SECRET` is non-empty
2. ✅ `ADMIN_ADDRESSES` is non-empty (at least one address)

If any check fails, the application logs an error and exits with status 1.

### Mainnet-Specific Warnings

If `STELLAR_NETWORK=mainnet`:

1. ⚠️ If `AUTH_SESSION_SECRET` is empty or a placeholder: **Warning logged** (not fatal)
2. ⚠️ If `ADMIN_ADDRESSES` is empty: **Warning logged** (operator routes will be blocked)

---

## Deployment Process

### Step 1: Prepare Environment Configuration

**On your local machine:**

```bash
# Create production environment file (never commit to git)
cat > backend/.env.production << 'EOF'
NODE_ENV=production
PORT=4000
LOG_LEVEL=info

DATABASE_URL=postgresql://cooplumen:cooplumen@prod-db.internal:5432/cooplumen
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
FRONTEND_URL=https://cooplumen.org
AUTH_SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ADMIN_ADDRESSES=GXXXX...,GYYYY...,GZZZZ...
STELLAR_MAINNET_GOVERNANCE_CONTRACT_ID=CAAA...
STELLAR_MAINNET_ISSUER_PUBLIC_KEY=GBBBB...
EOF

# Verify it
cat backend/.env.production
```

### Step 2: Verify Configuration

```bash
# Source the file and validate
source backend/.env.production

# Check critical values
echo "Network: $STELLAR_NETWORK"
echo "Horizon: $STELLAR_HORIZON_URL"
echo "Admin count: $(echo $ADMIN_ADDRESSES | tr ',' '\n' | wc -l)"
```

### Step 3: Build and Test Locally

```bash
# Build the backend
cd backend
npm install
npm run build
npm run lint
npm run type-check
npm test

# Build the frontend
cd ../frontend
npm install
npm run build
```

### Step 4: Deploy

**Using Docker Compose (production deployment):**

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Verify migrations work
docker-compose -f docker-compose.prod.yml run backend npm run db:migrate

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker-compose -f docker-compose.prod.yml logs -f backend
```

### Step 5: Verify Deployment

```bash
# Health check
curl https://cooplumen.org/api/v1/health

# Verify Stellar connectivity
curl https://cooplumen.org/api/v1/health | jq '.checks.stellar'

# Check logs for warnings
docker-compose -f docker-compose.prod.yml logs backend | grep -i "warning\|error"
```

---

## Rollback Procedure

If Mainnet deployment discovers critical issues:

### Option 1: Revert to Testnet (Immediate)

```bash
# Update environment variables
vi backend/.env.production  # Change STELLAR_NETWORK=testnet

# Restart services
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

# Verify
curl https://cooplumen.org/api/v1/health
```

### Option 2: Full Rollback (If Deployment Was Just Attempted)

```bash
# Stop current deployment
docker-compose -f docker-compose.prod.yml down -v

# Restore previous version
git checkout backend/Dockerfile frontend/Dockerfile
docker-compose -f docker-compose.prod.yml build

# Restart with previous code
docker-compose -f docker-compose.prod.yml up -d
```

### Option 3: Pause Mainnet Operations (Manual Incident Response)

If critical issue discovered post-launch:

```bash
# Use governance contract pause mechanism (requires Recovery or Pause role)
# See: docs/governance-contract.md - execute_pause()

# Or manually stop the backend
docker-compose -f docker-compose.prod.yml down

# Investigate
# Fix issue
# Redeploy when ready
```

---

## Monitoring Post-Deployment

### Critical Checks

- [ ] Application is running (`ps aux | grep node`)
- [ ] Database is connected (`curl /api/v1/health | jq '.checks.database'`)
- [ ] Stellar RPC is reachable (`curl /api/v1/health | jq '.checks.stellar'`)
- [ ] Logs are clean (no Critical or Error level entries)
- [ ] No stuck transactions (query Stellar for pending account changes)

### Daily Monitoring

- [ ] Review application logs for errors
- [ ] Monitor database connection pool
- [ ] Verify Stellar RPC uptime and response times
- [ ] Check rate limiting metrics (if Redis configured)

See `docs/production-monitoring.md` for detailed monitoring setup.

---

## FAQ

### Q: Can I test Mainnet configuration changes on Testnet first?

**A:** Yes. Before deploying to Mainnet, set `STELLAR_NETWORK=testnet` and run the full deployment pipeline on Testnet. Once verified, switch to `STELLAR_NETWORK=mainnet` and redeploy to production.

### Q: What if I accidentally set Mainnet configuration but still point to Testnet Horizon?

**A:** The application will connect to Testnet but uses the Mainnet network passphrase in transaction signing. Transactions will fail with an invalid signature error. This is by design — it prevents accidental cross-network reuse.

### Q: How do I change ADMIN_ADDRESSES in production?

**A:** Update the environment variable and restart the backend. No database migration needed. The change takes effect immediately after restart. The old admins' sessions remain valid until they expire.

### Q: Can I use the same STELLAR_WEBHOOK_SECRET on Testnet and Mainnet?

**A:** Yes, but it's not recommended. Use different secrets for each environment to limit cross-environment blast radius if one secret is compromised.

### Q: What if the Issuer account doesn't exist on Mainnet?

**A:** Asset issuance transactions will fail with a 404 (account not found). The error will be caught, logged, and surfaced to the user as "Account not funded." The transaction is never submitted.

### Q: Can I deploy to Mainnet without setting ADMIN_ADDRESSES?

**A:** No. The application will refuse to start in production mode (`NODE_ENV=production`) if `ADMIN_ADDRESSES` is empty. This is a safety feature to prevent misconfigured deployments.

---

## References

- [Stellar Horizon API — Public Mainnet](https://developers.stellar.org/api)
- [Stellar Network Information](https://developers.stellar.org/reference/testnet)
- `AUDIT_READINESS.md` — Security controls and network configuration
- `mainnet-issuer-setup.md` — Issuer account preparation
- `governance-contract-mainnet-deployment.md` — Contract deployment
- `production-monitoring.md` — Monitoring and alerting
