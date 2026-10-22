# Staging Environment Guide

This document describes the staging environment for CoopLumen, hosted on Fly.io (with Railway as a documented alternative), its environment secrets, configuration files, and GitHub Actions integration.

---

## 1. Overview & Architecture

The staging environment mirrors production while running against the Stellar Testnet and isolated staging data stores:

```
┌─────────────────────────────────────────────────────────────┐
│                   GitHub Actions CI/CD                      │
│   .github/workflows/deploy-staging.yml (Auto on main)      │
└───────────────────────────┬─────────────────────────────────┘
                            │ flyctl deploy
┌───────────────────────────▼─────────────────────────────────┐
│                    Fly.io Staging App                       │
│        cooplumen-staging-api (fly.staging.toml)             │
│   Port 4000 · Testnet Horizon · Health Check (/health)      │
│                                                             │
│   ┌──────────────────────────┐  ┌───────────────────────┐   │
│   │ Staging Postgres (Fly PG)│  │ Staging Redis (Upstash)│  │
│   └──────────────────────────┘  └───────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │ Smoke tests verify
┌───────────────────────────▼─────────────────────────────────┐
│              scripts/deploy/smoke-test.sh                   │
│   /health (200 & status:ok) · /api/communities · 404 handler│
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Configuration Files

### `fly.staging.toml`
The primary staging configuration is located in the repository root: `fly.staging.toml`.
- **App name**: `cooplumen-staging-api` (or overridden via `FLY_STAGING_APP` variable).
- **Target Dockerfile**: `backend/Dockerfile` (`production` stage).
- **HTTP checks**: Configured against `/health` with a 15-second interval and 10-second grace period.
- **Resources**: Dedicated shared CPU machine with 512MB RAM, autostop/autostart enabled.

### `railway.staging.json`
An alternative staging definition for Railway deployment:
- Builds using `backend/Dockerfile`.
- Health check path `/health` with a 30-second timeout.

---

## 3. Environment Secrets & Variables

Staging requires two layers of configuration: GitHub Actions secrets/variables, and the secrets set inside Fly.io (or Railway).

### GitHub Environment: `staging`

Configure in **Settings → Environments → staging**:

| Name | Type | Description |
| --- | --- | --- |
| `FLY_API_TOKEN` | Secret | Fly.io deployment token generated with `fly tokens create deploy` |
| `STAGING_ENABLED` | Variable | Set to `true` to enable automated deployment |
| `STAGING_URL` | Variable | Staging base URL (e.g. `https://cooplumen-staging-api.fly.dev`) |
| `FLY_STAGING_APP` | Variable | (Optional) Custom Fly.io app name if different from `fly.staging.toml` |

### Fly.io Application Secrets

Set inside the staging app using `flyctl secrets set` (or via Fly.io web console):

```bash
flyctl secrets set \
  DATABASE_URL="postgres://<user>:<password>@<fly-pg-host>:5432/cooplumen_staging?sslmode=disable" \
  REDIS_URL="redis://<user>:<password>@<fly-redis-host>:6379" \
  JWT_SECRET="<generate-random-staging-secret>" \
  STELLAR_NETWORK="testnet" \
  STELLAR_HORIZON_URL="https://horizon-testnet.stellar.org" \
  STELLAR_WEBHOOK_SECRET="<staging-stellar-webhook-secret>" \
  KYC_WEBHOOK_SECRET="<staging-kyc-webhook-secret>" \
  FRONTEND_URL="https://staging.cooplumen.org" \
  --config fly.staging.toml
```

---

## 4. One-Time Setup on Fly.io

Run these steps once to provision the staging infrastructure:

1. **Install flyctl and authenticate**:
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Create the staging app**:
   ```bash
   fly apps create cooplumen-staging-api
   ```

3. **Create and attach Staging PostgreSQL**:
   ```bash
   fly postgres create --name cooplumen-staging-db --vm-size shared-cpu-1x --initial-cluster-size 1
   fly postgres attach cooplumen-staging-db --app cooplumen-staging-api
   ```

4. **Create Staging Redis**:
   ```bash
   fly redis create --name cooplumen-staging-redis
   ```

5. **Set required secrets**:
   Use `flyctl secrets set` with the keys listed in Section 3.

6. **Create a deploy token for GitHub Actions**:
   ```bash
   fly tokens create deploy -x 999999h -a cooplumen-staging-api
   ```
   Add the generated token to GitHub repository/environment secrets as `FLY_API_TOKEN`.

---

## 5. Automated CI/CD Pipeline

The `.github/workflows/deploy-staging.yml` workflow manages deployments:

1. **Auto-Trigger**: Executes automatically when the `CI` workflow completes successfully on `main`.
2. **Manual Trigger**: Can be dispatched on demand via `workflow_dispatch` with an optional target `ref`.
3. **Inactivity Safety**: If `STAGING_ENABLED != 'true'`, the workflow is skipped, preventing failures on unconfigured environments.
4. **Post-Deployment Smoke Tests**: Immediately after deployment completes, the `smoke-tests` job runs `scripts/deploy/smoke-test.sh` against the staging URL, validating `/health`, API routes, and error handling.
