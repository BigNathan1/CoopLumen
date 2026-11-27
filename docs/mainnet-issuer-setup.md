# Mainnet Issuer Account Setup

**Purpose:** Guide for creating, funding, and verifying the issuer account on Stellar Mainnet  
**Audience:** Core team, deployment engineer  
**Prerequisites:** Stellar SDK installed, access to Mainnet, funding source (XLM)

---

## Overview

An issuer account on Stellar Mainnet is a Stellar public key responsible for issuing the community governance token. This account must:

1. Be created on Stellar Mainnet (public ledger, permanent)
2. Be funded with a minimum amount of XLM (base reserve + operational costs)
3. Remain secure (private key stored securely; never committed to git)
4. Be recorded in application configuration (`STELLAR_MAINNET_ISSUER_PUBLIC_KEY`)

This guide covers account creation, funding, verification, and safe credential management.

---

## Issuer Account Requirements

### Funding Amount

**Minimum balance calculation:**

```
Base Reserve (2 XLM)
  + Data Entries (0.5 XLM per entry; usually 0)
  + Trustlines (0.5 XLM per trustline; usually 1)
  + Operational buffer (2-5 XLM for transaction fees)
  = 4.5 - 7.5 XLM minimum
```

**Recommended:** Fund the issuer account with **10 XLM** initially.

- 2 XLM: base reserve (account existence)
- 0.5 XLM: trustline for DEX (optional)
- 1 XLM: transaction fees (~10,000 transactions at 100 stroops each)
- 6.5 XLM: buffer for operational costs and future trustlines

### Account Keypair

The issuer account has two keys:

| Key                  | Format                    | Use                                   |
| -------------------- | ------------------------- | ------------------------------------- |
| **Public Key**       | Starts with `G`; 56 chars | Non-secret; recorded in config        |
| **Private Key/Seed** | Starts with `S`; 56 chars | SECRET; stored securely; never in git |

**Important:** The private key is needed to sign transactions that issue tokens. Store it securely:

- ✅ Hardware security module (HSM)
- ✅ Vault (HashiCorp, AWS Secrets Manager, etc.)
- ✅ Encrypted secrets file (not committed to git)
- ❌ Plain text in code
- ❌ Environment variables in CI/CD logs
- ❌ Shared chat or email

---

## Step 1: Create Keypair

### Using Soroban CLI

If you have soroban-cli installed:

```bash
# Generate a new keypair
soroban keys generate --name mainnet-issuer

# View the public key
soroban keys address --name mainnet-issuer
# Output: GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# View the seed (KEEP THIS SECRET)
soroban keys show --name mainnet-issuer --show-seed
# Output: SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Using Stellar JavaScript SDK

If you prefer Node.js:

```bash
node -e "
const { Keypair } = require('@stellar/stellar-sdk');
const keypair = Keypair.random();
console.log('Public Key:', keypair.publicKey());
console.log('Seed:', keypair.secret());
console.log('⚠️ SAVE THE SEED SECURELY. Never commit to git.');
"
```

### Using Stellar Laboratory (Web)

Visit [Stellar Laboratory](https://laboratory.stellar.org/):

1. Go to **Account** → **Generate Keypair**
2. Click **Generate keypair**
3. Copy the public key and seed
4. Store seed securely (see below)

### Store Seed Securely

**Option A: Hardware Security Module (Recommended for production)**

```bash
# Store seed in HSM (e.g., using HSM CLI or API)
# Example: AWS CloudHSM
aws-cloudhsm-client key import --alias mainnet-issuer-seed \
  --key-value "SXXXXXXX..."
```

**Option B: Encrypted Vault**

```bash
# Store in HashiCorp Vault
vault kv put secret/cooplumen/mainnet/issuer seed="SXXXXXXX..."

# Store in AWS Secrets Manager
aws secretsmanager create-secret --name cooplumen/mainnet/issuer \
  --secret-string '{"seed":"SXXXXXXX..."}'
```

**Option C: Encrypted File (Development Only)**

```bash
# Create an encrypted secrets file (GPG or similar)
echo "SXXXXXXX..." | gpg --symmetric --output mainnet-issuer-seed.gpg

# Add to .gitignore to prevent accidental commits
echo "mainnet-issuer-seed.gpg" >> .gitignore
```

**Option D: File with Restricted Permissions (Local Development)**

```bash
# Create a secrets file
echo "SXXXXXXX..." > ~/.secrets/cooplumen-mainnet-issuer-seed

# Restrict permissions (Unix/Linux/macOS)
chmod 600 ~/.secrets/cooplumen-mainnet-issuer-seed

# Add to .gitignore
echo "~/.secrets/cooplumen-mainnet-issuer-seed" >> .gitignore
```

---

## Step 2: Fund the Issuer Account on Mainnet

**IMPORTANT:** This step involves real money on Stellar Mainnet. Transactions are permanent and cannot be reversed.

### Prerequisites

- [ ] Issuer public key generated and recorded (from Step 1)
- [ ] Funding source ready (another Mainnet account with XLM balance)
- [ ] 10+ XLM available for funding

### Funding Methods

#### Option A: Via Stellar Laboratory (Web)

1. Go to [Stellar Laboratory](https://laboratory.stellar.org/)
2. Select **Network** → **Mainnet**
3. Go to **Build Transaction** → **Payment**
4. Fill in:
   - **Source account:** Your funding account public key
   - **Destination:** Issuer public key (from Step 1)
   - **Amount:** 10 (XLM)
   - **Asset:** native (XLM)
5. Click **Build Transaction**
6. Sign with your funding account keypair (paste seed or use Freighter)
7. Click **Submit**

#### Option B: Via Stellar CLI

```bash
# Install stellar-cli
brew install stellar/tap/stellar-cli  # macOS
# or download from https://github.com/stellar/stellar-cli/releases

# Export keys
export FUNDING_ACCOUNT_SEED="SXXXXXXX..."  # Your funding account seed
export ISSUER_PUBLIC_KEY="GXXXXXXX..."     # The issuer account public key

# Submit payment
stellar contract invoke \
  --account $FUNDING_ACCOUNT_SEED \
  --network mainnet \
  --operation payment \
  --destination $ISSUER_PUBLIC_KEY \
  --amount 10 \
  --asset native
```

#### Option C: Via JavaScript/Node.js

```javascript
const {
  Keypair,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  Networks,
  Server,
} = require('@stellar/stellar-sdk');

const fundingKeypair = Keypair.fromSecret('SXXXXXXX...'); // Your funding account
const issuerPublicKey = 'GXXXXXXX...'; // The issuer account public key
const server = new Server('https://horizon.stellar.org'); // Mainnet

async function fundIssuer() {
  try {
    const account = await server.loadAccount(fundingKeypair.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.PUBLIC_GLOBAL, // Mainnet passphrase
    })
      .addOperation(
        Operation.payment({
          destination: issuerPublicKey,
          asset: Operation.native(), // XLM is native
          amount: '10',
        })
      )
      .setDefaultTimeout(30)
      .build();

    tx.sign(fundingKeypair);

    const result = await server.submitTransaction(tx);
    console.log('✅ Issuer account funded!');
    console.log(`Transaction hash: ${result.hash}`);
  } catch (error) {
    console.error('❌ Funding failed:', error.message);
  }
}

fundIssuer();
```

#### Option D: Via Exchange or Custodian

If using a cryptocurrency exchange or custodian service:

1. Request a withdrawal to the issuer public key
2. Amount: 10 XLM
3. Verify transaction on Stellar Expert or Horizon after confirmation

---

## Step 3: Verify Issuer Account on Mainnet

### Check Account Exists and Has Balance

**Via Stellar Expert (Web):**

1. Go to [Stellar Expert](https://stellar.expert/explorer/public)
2. Search for the issuer public key
3. Verify:
   - Account exists
   - Native balance ≥ 10 XLM
   - No error messages

**Via Horizon API (CLI):**

```bash
ISSUER_PUBLIC_KEY="GXXXXXXX..."

# Get account details
curl "https://horizon.stellar.org/accounts/$ISSUER_PUBLIC_KEY" | jq .

# Expected output:
# {
#   "id": "GXXXXXXX...",
#   "balances": [
#     {
#       "balance": "10.0000000",
#       "asset_type": "native",
#       "asset_code": null,
#       "asset_issuer": null
#     }
#   ],
#   "native_balance": "10.0000000",
#   ...
# }
```

**Via JavaScript SDK:**

```javascript
const { Server } = require('@stellar/stellar-sdk');

const issuerPublicKey = 'GXXXXXXX...';
const server = new Server('https://horizon.stellar.org');

async function verifyIssuer() {
  try {
    const account = await server.loadAccount(issuerPublicKey);
    console.log('✅ Account found on Mainnet');
    console.log(`XLM balance: ${account.balances[0].balance}`);
  } catch (error) {
    console.error('❌ Account not found:', error.message);
  }
}

verifyIssuer();
```

### Record Transaction Hash

After funding, save the transaction hash:

```bash
# Transaction hash from funding step
TX_HASH="1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"

# Verify transaction on Stellar Expert
echo "https://stellar.expert/explorer/public/tx/$TX_HASH"

# Save to documentation
echo "Issuer Account Funding TX: $TX_HASH" >> docs/mainnet-deployment-log.md
```

---

## Step 4: Configure Application

### Update Environment Variables

In `backend/.env.production` (never commit to git):

```bash
# Mainnet configuration
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_MAINNET_ISSUER_PUBLIC_KEY=GXXXXXXX...
```

### Verify Configuration

```bash
# Source the file
source backend/.env.production

# Verify issuer key is set
echo "Issuer: $STELLAR_MAINNET_ISSUER_PUBLIC_KEY"

# Check it matches what we funded
# Should start with 'G' and be 56 characters
```

---

## Step 5: Test with Health Check

```bash
# Start the application
docker-compose -f docker-compose.prod.yml up -d

# Wait for startup
sleep 5

# Check health
curl http://localhost:4000/api/v1/health | jq .

# Expected output (truncated):
# {
#   "status": "ok",
#   "checks": {
#     "database": "ok",
#     "stellar": "ok"
#   }
# }

# Verify no errors in startup logs
docker-compose logs backend | grep -i "error\|critical"
# Should return no matches
```

---

## Credential Security Checklist

- [ ] **Private seed stored securely** (not in git, not in logs, not in env vars)
- [ ] **Public key recorded** in `STELLAR_MAINNET_ISSUER_PUBLIC_KEY` environment variable
- [ ] **No seed in code comments** (removed all `// SXXXXXXX...` remnants)
- [ ] **No seed in git history** (verify with `git log -S "SXXXXXXX"`)
- [ ] **Seed backed up** to secure location (HSM, vault, encrypted file)
- [ ] **Seed access restricted** (only core team members with need-to-know)
- [ ] **Rotation plan documented** (how to regenerate if compromised)

---

## Emergency Procedures

### If Issuer Private Key is Compromised

**Immediate actions:**

1. **Pause operations** — If possible, pause governance via contract pause mechanism
2. **Create new issuer account** — Follow Steps 1–3 to create replacement
3. **Update configuration** — Update `STELLAR_MAINNET_ISSUER_PUBLIC_KEY` with new account
4. **Redeploy** — Push updated configuration and restart application
5. **Audit transactions** — Review Mainnet for any unauthorized activities
6. **Notify users** (if applicable) — Announce account rotation to community

### If Issuer Account is Drained

**Recovery actions:**

1. **Do not panic** — Transactions cannot be reversed; but recovery is possible
2. **Verify incident** — Confirm unauthorized withdrawal on Stellar Expert
3. **Refund account** — Fund the account again if needed for continued operations
4. **Investigate** — Review account history to find vulnerability
5. **Fix vulnerability** — Address root cause before resuming normal operations
6. **Communicate** — Notify stakeholders of incident and remediation

### If Mainnet Governance Contract is Compromised

1. **Invoke pause** — Use contract pause mechanism to halt operations
2. **Investigate** — Analyze contract state and recent transactions
3. **Plan recovery** — Determine if contract can be fixed or must be redeployed
4. **Communicate** — Notify community of incident and timeline
5. **Revert to Testnet** (if necessary) — Temporarily operate on Testnet until resolved

---

## FAQ

### Q: Can I use the same issuer account on Testnet and Mainnet?

**A:** No. Testnet and Mainnet are separate networks with separate ledgers. Create separate issuer accounts for each network. This prevents cross-network confusion.

### Q: What if I lose the private key?

**A:** If the issuer private key is lost, you cannot recover it. The account remains on Mainnet but cannot be used to issue new tokens or sign transactions. You must create a new issuer account and redeploy the application. Notify stakeholders immediately.

### Q: How much XLM should I fund the issuer with?

**A:** Start with 10 XLM. This covers base reserve (2 XLM), operational costs (~1 XLM), and buffer (~7 XLM). Monitor usage in production and top up as needed.

### Q: Can I issue multiple tokens from one issuer account?

**A:** Yes. One issuer account can issue multiple assets (up to 2^63-1 different assets). Each asset is identified by its code and issuer account. CoopLumen uses one issuer per community, but a single Mainnet account could technically issue for multiple communities (not recommended for security/audit reasons).

### Q: What if the issuer account gets stuck (account full of trustlines)?

**A:** Each trustline costs 0.5 XLM. If the account reaches the XLM balance limit, fund it with more XLM. The blockchain does not prevent this; it's an operational concern.

### Q: Can I change the issuer public key after deployment?

**A:** Yes, but it requires redeploying the application and updating all configuration. Assets issued under the old issuer remain on the old account; new issuances use the new account. This is a destructive change and should not be done lightly.

---

## References

- [Stellar Account Model](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts)
- [Stellar Payments](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/operations-and-transactions#payment)
- [Stellar Laboratory](https://laboratory.stellar.org/)
- [Stellar Expert](https://stellar.expert/)
- `mainnet-configuration.md` — Network configuration
- `governance-contract-mainnet-deployment.md` — Contract deployment after issuer account is ready
