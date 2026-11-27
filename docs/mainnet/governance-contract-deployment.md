# Governance Contract Mainnet Deployment

**Purpose:** Deploy the CoopLumen Soroban governance contract to Stellar Mainnet  
**Audience:** Core team, deployment engineer  
**Prerequisites:** Governance contract built locally, Mainnet account with XLM for deployment fee, soroban-cli installed

---

## Overview

The governance contract is a Soroban smart contract that powers on-chain proposal voting and governance. This guide covers:

1. Building the contract locally
2. Testing deployment on Testnet
3. Deploying to Mainnet with explicit authorization
4. Verifying the deployed contract
5. Recording deployment details

**Key principle:** Mainnet deployments are permanent and require explicit human authorization. Deployment is a multi-step process with safety guards.

---

## Prerequisites

### Tools

- ✅ **soroban-cli** installed and up-to-date

  ```bash
  soroban --version
  # Should be ≥ v21.0.0
  ```

- ✅ **Rust toolchain** (for compiling contract)

  ```bash
  rustup --version
  cargo --version
  ```

- ✅ **CoopLumen repository** cloned locally
  ```bash
  git clone https://github.com/BigNathan1/CoopLumen.git
  cd CoopLumen
  ```

### Accounts & Funding

- ✅ **Deployment account:** A Stellar account on Mainnet with:
  - 1-2 XLM (for deployment fee + buffer)
  - Private key accessible to signer (HSM, Vault, or temporary env var)

- ✅ **Issuer account:** Already created and funded (see `issuer-setup.md`)

### Configuration

- ✅ **Smart contract compiled** and artifact ready (`contracts/governance/`)
- ✅ **Testnet deployment tested** (same process, smaller risk)
- ✅ **Go/no-go approval** from core team

---

## Step 1: Build Contract Locally

```bash
# Navigate to contract directory
cd contracts/governance

# Clean previous builds
rm -rf target/

# Build the contract (optimized for deployment)
cargo build --release --target wasm32-unknown-unknown

# Verify artifact was created
ls -lh target/wasm32-unknown-unknown/release/cooplumen_governance.wasm

# Expected output: ~200–400 KB WASM binary
```

### Verify Contract Tests Pass

```bash
# Run contract unit tests
cargo test --release

# Expected output:
# test result: ok. XX passed; 0 failed; ...
```

---

## Step 2: Deploy to Testnet (Pre-Production Validation)

**Before deploying to Mainnet, validate the exact deployment process on Testnet.**

### Setup Testnet Deployment Account

```bash
# Generate a test keypair (Testnet only)
soroban keys generate --name testnet-deploy-test

# Get public key for funding
soroban keys address --name testnet-deploy-test
# Output: GXXXXXXX...

# Fund from Friendbot (Testnet only)
curl -X POST https://friendbot.stellar.org/claim?account=GXXXXXXX...
# Returns: 5000 XLM (free testnet funds)

# Verify funding
soroban account-info --key testnet-deploy-test --network testnet
```

### Deploy to Testnet

```bash
# Navigate to contract directory
cd contracts/governance

# Deploy to Testnet (uses testnet-deploy-test account)
TESTNET_CONTRACT_ID=$(soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/cooplumen_governance.wasm \
  --key testnet-deploy-test \
  --network testnet)

echo "Testnet Contract ID: $TESTNET_CONTRACT_ID"
# Output example: CABC123...XYZ (starts with 'C')

# Save for reference
echo "STELLAR_TESTNET_GOVERNANCE_CONTRACT_ID=$TESTNET_CONTRACT_ID" >> /tmp/testnet-deploy.env
```

### Test Deployed Contract

```bash
# Verify contract exists on Testnet
soroban contract info --contract-id $TESTNET_CONTRACT_ID --network testnet

# Initialize the contract (required before use)
soroban contract invoke \
  --contract-id $TESTNET_CONTRACT_ID \
  --network testnet \
  --key testnet-deploy-test \
  --function initialize \
  --arg-sc-val 'Address:0123456789abcdef0123456789abcdef01234567' \
  --arg-sc-val 'Address:fedcba9876543210fedcba9876543210fedcba98' \
  --arg-sc-val 'u64:604800' \
  --arg-sc-val 'u32:5000' \
  --arg-sc-val 'i128:1000000000'

# If successful, you'll see:
# Result: Success
```

### Verify Testnet Deployment

```bash
# Read contract config to confirm initialization
soroban contract invoke \
  --contract-id $TESTNET_CONTRACT_ID \
  --network testnet \
  --function get_config

# Expected output: Config struct with admin, governance_token, voting_period, etc.
```

**If Testnet deployment succeeds, proceed to Mainnet. If it fails, debug locally before attempting Mainnet.**

---

## Step 3: Prepare Mainnet Deployment

### Create Deployment Account or Use Existing

**Option A: Create new account (recommended for clarity)**

```bash
# Generate a new keypair for Mainnet deployment
soroban keys generate --name mainnet-deploy

# Get public key
soroban keys address --name mainnet-deploy
# Output: GXXXXXXX...

# Store the seed securely (HSM or Vault)
# DO NOT save in .env or commit to git
soroban keys show --name mainnet-deploy --show-seed
```

**Option B: Use existing Mainnet account**

```bash
# Use an existing key already in soroban-cli
soroban keys list
# Output: mainnet-deploy, other-key, ...

# Verify public key matches account you plan to use
soroban keys address --name mainnet-deploy
```

### Verify Mainnet Deployment Account Has XLM

```bash
# Check account balance on Mainnet
soroban account-info --key mainnet-deploy --network mainnet

# Expected output:
# {"account": "GXXXXXXX...", "balance": "2.5000000", ...}
#
# Minimum: 2 XLM (base reserve + contract deployment fee)
# Recommended: 5 XLM (buffer for operations)
```

If balance is insufficient, fund the account from your Mainnet source (exchange, another account, etc.).

---

## Step 4: Deploy to Mainnet (Explicit Authorization Required)

### Pre-Deployment Checklist

Before submitting the deployment transaction, verify:

- [ ] Contract builds successfully locally (`cargo build --release`)
- [ ] Contract tests pass (`cargo test --release`)
- [ ] Testnet deployment succeeded (same process, verified)
- [ ] Mainnet deployment account has ≥2 XLM
- [ ] Go/no-go approval received from core team
- [ ] Deployment procedure reviewed and understood

### Execute Mainnet Deployment

```bash
# Navigate to contract directory
cd contracts/governance

# Deploy to Mainnet (this is permanent)
# When prompted, you MUST explicitly authorize with your private key
MAINNET_CONTRACT_ID=$(soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/cooplumen_governance.wasm \
  --key mainnet-deploy \
  --network mainnet)

echo "✅ Mainnet Contract ID: $MAINNET_CONTRACT_ID"
# Output example: CABC123...XYZ
```

**IMPORTANT:**

- This transaction costs real XLM (≈0.001 XLM base fee)
- The transaction is permanent; cannot be reversed
- The contract ID is permanent and tied to this deployment
- The contract is active immediately after confirmation

### Record Deployment Details

```bash
# Capture deployment information
CONTRACT_ID="$MAINNET_CONTRACT_ID"  # From output above

# Query Stellar for transaction details
# (This takes a few seconds; transaction must finalize first)
sleep 10

# Get account to find transaction
soroban account-info --key mainnet-deploy --network mainnet | jq '.sequence_number'

# Save to deployment log
cat > docs/mainnet-deployment-log.md << EOF
# Mainnet Deployment Log

**Date:** $(date)
**Contract ID:** $CONTRACT_ID
**Network:** Mainnet (Public Global Stellar Network)
**Deployer:** $(soroban keys address --name mainnet-deploy)

## Verification

Contract deployed and ready for initialization.

EOF

echo "Deployment details saved to docs/mainnet-deployment-log.md"
```

---

## Step 5: Verify Deployed Contract

### Contract Exists

```bash
# Verify contract is on Mainnet
soroban contract info \
  --contract-id $MAINNET_CONTRACT_ID \
  --network mainnet

# Expected output:
# {
#   "id": "CABC123...XYZ",
#   "code_hash": "...",
#   "network": "mainnet",
#   ...
# }
```

### Contract on Stellar Expert

Visit [Stellar Expert](https://stellar.expert/explorer/public) to view:

1. Search for contract ID (starts with `C`)
2. Verify:
   - Contract exists
   - Network is "Public (Mainnet)"
   - No errors displayed

---

## Step 6: Initialize Contract

After deployment, the contract must be initialized with governance parameters.

### Prepare Initialization Parameters

```bash
# Define initialization arguments
# These match the Config struct in contracts/governance/src/lib.rs

ADMIN_ADDRESS="GXXXX..."           # Admin account (governance holder)
GOVERNANCE_TOKEN="GXXXX..."        # Token contract or address (use issuer for now)
VOTING_PERIOD=604800              # Voting window: 7 days in seconds
QUORUM_BPS=5000                    # Quorum: 50% (basis points; 10000 = 100%)
TOTAL_SUPPLY="1000000000"          # Total supply of governance token
```

### Initialize the Contract

```bash
# Call initialize() on the deployed contract
soroban contract invoke \
  --contract-id $MAINNET_CONTRACT_ID \
  --network mainnet \
  --key mainnet-deploy \
  --function initialize \
  --arg-sc-val "Address:$ADMIN_ADDRESS" \
  --arg-sc-val "Address:$GOVERNANCE_TOKEN" \
  --arg-sc-val "u64:$VOTING_PERIOD" \
  --arg-sc-val "u32:$QUORUM_BPS" \
  --arg-sc-val "i128:$TOTAL_SUPPLY"

# Expected output:
# Result: Success (or error if parameters invalid)
```

**If initialization fails:**

1. Check error message for parameter issues
2. Fix parameters and retry
3. If contract is broken, you may need to redeploy (create new contract ID)

### Verify Initialization

```bash
# Read contract config to confirm successful initialization
soroban contract invoke \
  --contract-id $MAINNET_CONTRACT_ID \
  --network mainnet \
  --function get_config

# Expected output:
# {
#   "admin": "GXXXX...",
#   "governance_token": "GXXXX...",
#   "voting_period": 604800,
#   "quorum_bps": 5000,
#   "total_supply": 1000000000
# }
```

---

## Step 7: Update Application Configuration

### Update Environment Variables

In `backend/.env.production`:

```bash
# Mainnet governance contract
STELLAR_MAINNET_GOVERNANCE_CONTRACT_ID=CABC123...XYZ

# Mainnet issuer (from issuer-setup.md)
STELLAR_MAINNET_ISSUER_PUBLIC_KEY=GXXXX...
```

### Update Application Code (Optional)

If the contract ID should be read from configuration at runtime:

```typescript
// backend/src/contracts/governance.ts
export function getGovernanceContractId(): string {
  if (process.env.STELLAR_NETWORK === 'mainnet') {
    const contractId = process.env.STELLAR_MAINNET_GOVERNANCE_CONTRACT_ID;
    if (!contractId?.startsWith('C')) {
      throw new Error('Invalid or missing STELLAR_MAINNET_GOVERNANCE_CONTRACT_ID');
    }
    return contractId;
  }
  // Testnet contract ID from environment or hardcoded
  return process.env.STELLAR_TESTNET_GOVERNANCE_CONTRACT_ID ?? 'CTESTNET...';
}
```

### Redeploy Backend

```bash
# Rebuild and restart backend with new configuration
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Verify logs
docker-compose logs backend | head -20
```

---

## Step 8: Smoke Test

### Test Contract Functionality

```bash
# Create a test proposal (requires valid caller auth in real scenario)
# This is a simulation; real calls require wallet signing

soroban contract invoke \
  --contract-id $MAINNET_CONTRACT_ID \
  --network mainnet \
  --key mainnet-deploy \
  --function create_proposal \
  --arg-sc-val "Address:$(soroban keys address --name mainnet-deploy)" \
  --arg-sc-val "String:Test Proposal" \
  --arg-sc-val "String:Testing governance contract on Mainnet" \
  --arg-sc-val 'Vec<String>:[String:"action1"]'

# Expected output: Success (proposa ID 1)
```

### Verify Frontend Integration

1. Log into the application (localhost or staging environment)
2. Create a community
3. Create a proposal
4. Verify proposal appears on-chain

---

## Rollback Procedure

**Important:** Contract deployments are permanent on Mainnet. There is no rollback, only redeployment.

If critical issues discovered:

### Option 1: Pause Contract (If Pause Role Configured)

```bash
# Use governance contract pause mechanism
soroban contract invoke \
  --contract-id $MAINNET_CONTRACT_ID \
  --network mainnet \
  --key mainnet-deploy \
  --function execute_pause \
  --arg-sc-val 'String:Global' \
  --arg-sc-val 'String:Incident reason'

# This prevents new proposals; existing proposals remain finalizeable
```

### Option 2: Redeploy New Contract

```bash
# Deploy new contract instance with same parameters
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/cooplumen_governance.wasm \
  --key mainnet-deploy \
  --network mainnet

# Initialize new contract
# Update backend configuration to use new contract ID
# Redeploy backend

# Notify users of contract migration
```

### Option 3: Manual Recovery (Post-Incident)

1. Analyze what went wrong
2. Implement fix in code
3. Recompile contract
4. Deploy new instance (new contract ID)
5. Communicate incident and migration to community

---

## Deployment Log Template

Keep a record of deployment:

```markdown
# CoopLumen Governance Contract — Mainnet Deployment

**Date:** YYYY-MM-DD  
**Deployed by:** [Name/Team]  
**Approval:** [Link to approval, meeting notes, etc.]

## Deployment Details

- **Contract ID (Mainnet):** CABC123...XYZ
- **Deployer Account:** GXXXX...
- **Network:** Stellar Mainnet (Public Global)
- **Deployment TX Hash:** [TBD — available after confirmation]

## Initialization

- **Admin:** GXXXX... (governance account)
- **Governance Token:** GXXXX... (token contract)
- **Voting Period:** 604800 seconds (7 days)
- **Quorum:** 5000 basis points (50%)
- **Total Supply:** 1,000,000,000 tokens

## Verification

- [ ] Contract deployed and confirmed
- [ ] Contract initialized successfully
- [ ] Config verified via get_config()
- [ ] Backend configuration updated
- [ ] Backend redeployed with new contract ID
- [ ] Smoke tests passed
- [ ] Users notified

## Post-Deployment Monitoring

- [ ] Monitor contract invocations for errors
- [ ] Monitor proposal creation
- [ ] Monitor voting functionality
- [ ] Check for any unexpected behavior

## Incident Log

(None — successful deployment)
```

---

## Troubleshooting

### Error: "Invalid contract wasm"

**Cause:** WASM binary is corrupted or incompatible

**Fix:**

1. Clean and rebuild: `cargo clean && cargo build --release`
2. Verify Soroban SDK version: `grep soroban-sdk Cargo.toml`
3. Ensure Rust toolchain is up-to-date: `rustup update`

### Error: "Account has insufficient balance"

**Cause:** Deployment account has < 2 XLM

**Fix:**

1. Fund the account with more XLM
2. Wait for transaction to confirm (~5 seconds)
3. Retry deployment

### Error: "Network error: Connect timeout"

**Cause:** Cannot reach Stellar Mainnet

**Fix:**

1. Check internet connection
2. Verify Mainnet is operational: `curl https://horizon.stellar.org/`
3. Try again after a few seconds

### Contract deploys but initialization fails

**Cause:** Invalid initialization parameters

**Fix:**

1. Check parameter types (must match Config struct)
2. Check addresses start with 'G' (public keys) or 'C' (contract IDs)
3. Check numeric values are in valid ranges
4. Verify quorum_bps ≤ 10000

### Contract works on Testnet but not Mainnet

**Cause:** Network-specific issue or contract state differs

**Fix:**

1. Verify contract ID matches Mainnet
2. Verify initialization parameters are correct for Mainnet
3. Check Stellar network compatibility
4. Review contract logs for errors

---

## References

- [Soroban Smart Contracts — Deploy](https://developers.stellar.org/docs/build/smart-contracts/deploy)
- [Soroban CLI Reference](https://github.com/stellar/rs-soroban-cli)
- [CoopLumen Governance Contract — Interface](../governance-contract.md)
- [Mainnet Configuration](configuration.md)
- [Issuer Account Setup](issuer-setup.md)
