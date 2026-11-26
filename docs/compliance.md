# Compliance Model and Limitations

This document describes the regulatory compliance model, transaction limit enforcement, KYC status tracking, and current technical limitations in CoopLumen.

## 1. Overview and Scope

CoopLumen is designed to operate within real-world regulatory constraints while enabling decentralized community finance on the Stellar blockchain. The platform's compliance layer is deliberately scoped to provide the essential groundwork:

- SEP-12-aligned KYC status tracking and verification plumbing
- Deterministic per-account daily transaction volume limits for unverified members
- Community-scoped reputation scoring and multi-signature controls for Sybil resistance

CoopLumen does **not** act as a custodian, money transmitter, or full-suite automated compliance provider. User funds and keys remain under non-custodial member control, and regulatory identity verification is offloaded to regulated third-party anchors.

---

## 2. SEP-12 KYC Status Tracking

Identity verification in CoopLumen adheres to Stellar Ecosystem Proposal 12 (SEP-12), which defines standard customer information interactions between wallets and financial institutions/anchors.

### Status Mapping

The backend (`backend/src/api/routes/kyc.ts`) persists provider interactions in the `kyc_records` table and translates internal provider lifecycles into standardized public API statuses:

| Stored Status (`kyc_records.status`) | Public API Status (`GET /api/v1/kyc/status/:address`) | Description                                                       |
| ------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------- |
| _(no record)_                        | `none`                                                | No KYC process initiated for this address in the community.       |
| `pending`                            | `pending`                                             | KYC initiated; awaiting user input or submission.                 |
| `submitted`                          | `pending`                                             | Verification documents submitted to provider; review in progress. |
| `verified`                           | `approved`                                            | Anchor verified the account; limits lifted.                       |
| `rejected`                           | `rejected`                                            | Verification failed or declined by provider.                      |
| `expired`                            | `rejected`                                            | Prior verification has expired and requires renewal.              |

### Lifecycle and Scoping

- **Community-scoped**: KYC records are tracked per `(community_id, stellar_address)`. A verified status in one community does not automatically grant verified status in an unrelated community.
- **Data Minimization**: Personally Identifiable Information (PII) such as passport photos, tax IDs, and physical addresses are handled directly by the SEP-12 anchor. CoopLumen stores only status metadata, timestamps, and provider references.

---

## 3. Transaction Limits and Enforcement

To mitigate illicit financial flows, spam, and early-stage abuse prior to formal identity verification, CoopLumen enforces deterministic daily limits on unverified accounts.

### Limit Specifications

- **Limit Constant**: `UNVERIFIED_DAILY_LIMIT = 100.0000000` (defined in `backend/src/services/compliance.ts`).
- **Scope**: Applied to transfers of community-issued tokens (`asset_code` and `asset_issuer` matching an active community).
- **Time Window**: UTC calendar day (`[UTC 00:00:00, next day UTC 00:00:00)`).
- **Exemption**: Accounts with `status = 'verified'` in `kyc_records` for that community are exempt from unverified daily limits.

### Reservation Architecture

The backend implements an atomic two-phase reservation pattern to eliminate race conditions and avoid double-spending of the daily allowance:

1. **Advisory Lock**: A PostgreSQL transaction-level advisory lock (`pg_advisory_xact_lock(hashtext('communityId:stellarAddress'))`) serializes concurrent transfer requests for the same account.
2. **Usage Calculation**: Sums all existing `compliance_transfers` in `reserved` or `submitted` status within the current UTC day.
3. **Threshold Check**: If `dailyTotal + attemptedAmount > 100.0000000`, the transaction is rejected with `DailyTransactionLimitError` (`UNVERIFIED_DAILY_LIMIT_EXCEEDED`).
4. **Reservation Creation**: A record is written to `compliance_transfers` with status `reserved`.
5. **Settlement Hooks**:
   - On successful submission to Horizon: `markTransferSubmitted(reservationId, txHash)` updates status to `submitted`.
   - On network or validation failure: `markTransferFailed(reservationId)` deletes or cleans up the reservation to restore available allowance.

---

## 4. Sybil Resistance and Reputation

CoopLumen mitigates Sybil attacks and fraudulent defaults through a combination of on-chain history and mathematical reputation weighting:

- **Smoothed Reputation Formula**: Reputation scores are derived from loan repayment and default history using a Laplace-smoothed success ratio:
  $$\text{score} = \text{round}\left(\frac{100 \times (\text{on\_time} + 1)}{\text{on\_time} + \text{defaults} + 2}, 2\right)$$
  New members begin near a neutral score of 50.00 rather than 0 or 100, preventing empty accounts from exploiting high default trust.
- **Treasury Multi-Signature Controls**: Community treasury operations and parameter alterations require multi-signature approval (`multisig_requests`), ensuring single accounts cannot unilaterally drain shared liquidity pools.
- **Community Pool Membership**: Loan requests require verified active membership (`members` table) in the target community before funds can be allocated.

---

## 5. Limitations and Out-of-Scope Capabilities

CoopLumen's compliance mechanisms are deliberately focused on core safety primitives. The following limitations apply to the current architecture:

1. **Non-Custodial Nature**:
   - CoopLumen never holds private keys. All transactions must be signed by the user's wallet (e.g. Freighter).
   - If an unverified user executes direct peer-to-peer transfers on the Stellar ledger outside the CoopLumen API layer, those transactions are governed solely by Stellar consensus and trustlines.
2. **Third-Party Identity Custody**:
   - Identity verification and sanctions screening (OFAC, PEP, etc.) depend entirely on configured external SEP-12 anchors. CoopLumen does not run internal identity document parsing engines.
3. **Key-Based Identification**:
   - Transaction volume is tracked per Stellar public key. A single actor who controls multiple unfunded Stellar accounts without completing KYC can technically operate each account up to the 100-token threshold unless flagged by IP/rate-limiting or anchor-level Sybil detection.
4. **Calendar-Day Windows**:
   - Daily allowances reset at UTC midnight rather than a sliding 24-hour window.
5. **Mainnet Regulatory Compliance**:
   - Prior to operating on public mainnet with fiat-pegged anchors, communities must configure legal entities and establish partnerships with licensed anchors in their target operating jurisdictions.
