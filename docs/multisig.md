# Multi-Signature Treasury Controls & Batch Operations

> **Comprehensive guide to multi-signature treasury management, collaborative transaction signing, and atomic batch disbursements in CoopLumen.**

---

## 1. Overview

CoopLumen provides cooperative communities, NGOs, and shared treasuries with decentralized fund management on the Stellar blockchain. When a community outgrows a single trusted administrator, **Multi-Signature (Multi-Sig)** controls allow $N$-of-$M$ signers to co-govern treasury funds without intermediaries.

Key capabilities:

- **$N$-of-$M$ Threshold Governance**: Transactions require a configurable threshold of signer weights before they can be submitted to the Stellar network.
- **Off-Chain Proposal & Signature Aggregation**: The backend coordinates multi-sig proposals, notifies co-signers, aggregates signed transaction XDR envelopes, and tracks execution status.
- **Atomic Batch Disbursements**: Multiple payment operations are packaged into a single Stellar transaction envelope, saving transaction fees and ensuring atomic settlement.

---

## 2. Stellar Multi-Signature Model

Stellar natively supports multi-signature accounts at the protocol layer without requiring custom smart contracts for standard account operations.

### Thresholds and Weights

Every Stellar account defines three operation thresholds:

1. **Low Threshold**: Used for `allow_trust` and bump sequence operations.
2. **Medium Threshold**: Used for standard operations, including payments (`payment`, `path_payment_strict_send`, `create_account`).
3. **High Threshold**: Used for administrative operations (`set_options` to modify signers or thresholds, `account_merge`).

Each signer on the account is assigned an integer **weight**. When a transaction is submitted:
$$\sum_{\text{signers with valid signatures}} \text{weight} \ge \text{Operation Threshold}$$

### Example 2-of-3 Setup

| Signer             | Role                  | Weight |
| ------------------ | --------------------- | ------ |
| Signer 1 (`GA...`) | President / Treasurer | 1      |
| Signer 2 (`GB...`) | Co-founder            | 1      |
| Signer 3 (`GC...`) | Auditor / Member      | 1      |

- **Medium Threshold**: `2`
- **Behavior**: Any 2 of the 3 signers must sign a payment transaction for it to be accepted on-chain.

---

## 3. Multi-Sig Proposal Lifecycle

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ 1. PROPOSE  ├──────►│ 2. CO-SIGN  ├──────►│ 3. APPROVED ├──────►│ 4. EXECUTE  │
│  (Pending)  │       │ (Collecting)│       │  (Ready)    │       │ (Executed)  │
└──────┬──────┘       └──────┬──────┘       └─────────────┘       └─────────────┘
       │                     │
       ▼                     ▼
┌───────────────────────────────────┐
│           REJECTED                │
│     (Rejected by Co-Signer)       │
└───────────────────────────────────┘
```

1. **Proposal (`pending`)**: A community member or officer initiates a multi-sig action (such as a batch treasury payout). The backend creates an unsigned Stellar transaction envelope with appropriate `timeBounds` and registers the request.
2. **Co-Signing**: Co-signers review the proposal details, verify the destination addresses and amounts, and sign the transaction XDR using their Stellar wallet (e.g. Freighter).
3. **Threshold Attainment (`approved`)**: Once `current_signatures >= required_signatures`, the proposal automatically transitions to `approved`. The aggregated transaction envelope is ready for on-chain submission.
4. **Execution (`executed`)**: Any signer or automated executor submits the fully signed transaction envelope to the Stellar network (Horizon / RPC). The resulting on-chain transaction hash (`stellar_tx_hash`) is recorded, and the request is marked `executed`.
5. **Rejection (`rejected`)**: If a co-signer rejects the proposal, it transitions to `rejected` with a recorded `rejection_reason`.

---

## 4. Atomic Batch Operations

Batch operations combine multiple disbursements into a single transaction envelope.

### Advantages:

- **Atomic Execution**: All payments succeed together or the entire batch fails; no partial payouts or inconsistent ledger states.
- **Fee Efficiency**: A single base transaction fee covers all operations.
- **Single Sequence Number**: Prevents sequence number race conditions across concurrent disbursements.

### Builder Details (`backend/src/contracts/transactions.ts`):

```typescript
import { buildMultiSigPayment } from './contracts/transactions';

const { xdr, requiredWeight, availableWeight, minimumSignatures } = await buildMultiSigPayment({
  sourcePublicKey: treasuryAddress,
  destinationPublicKey: recipientAddress,
  assetCode: 'ECO',
  assetIssuer: issuerAddress,
  amount: '500.0000000',
  memo: 'Disbursement #1',
  timeoutSeconds: 86400, // 24-hour signature collection window
});
```

---

## 5. REST API Reference

### 1. Create a Multi-Sig Request

- **Endpoint**: `POST /api/v1/multisig/community/:communityId`
- **Request Body**:
  ```json
  {
    "proposer_address": "GB7QUZ7Z4C6C7DYXU4EB3OG4GLH5HSZX75QW2IQ3YSNKMGHWEJ5FCF6",
    "action": "payment",
    "title": "Community Water Well Grant",
    "description": "Disburse 500 ECO tokens to contractor",
    "payload": {
      "recipient": "GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U",
      "amount": "500.0000000"
    },
    "transaction_xdr": "AAAAAgAAAA...",
    "required_signatures": 2,
    "expires_at": "2026-12-31T23:59:59Z"
  }
  ```
- **Response**: `201 Created` with the newly created `MultiSigRow`.

### 2. List Community Requests

- **Endpoint**: `GET /api/v1/multisig/community/:communityId?status=pending&page=1&limit=20`
- **Response**: `200 OK` with paginated `data` array and pagination `meta`.

### 3. Get Request Details

- **Endpoint**: `GET /api/v1/multisig/requests/:id`
- **Response**: `200 OK` with request row.

### 4. Approve / Co-Sign Request

- **Endpoint**: `POST /api/v1/multisig/requests/:id/approve`
- **Request Body**:
  ```json
  {
    "signed_xdr": "AAAAAgAAAA...<signed>"
  }
  ```
- **Response**: `200 OK` with updated status and signature count.

### 5. Reject Request

- **Endpoint**: `POST /api/v1/multisig/requests/:id/reject`
- **Request Body**:
  ```json
  {
    "reason": "Amount exceeds approved budget for Q3"
  }
  ```
- **Response**: `200 OK` with status `rejected`.

### 6. Execute Request

- **Endpoint**: `POST /api/v1/multisig/requests/:id/execute`
- **Request Body**:
  ```json
  {
    "stellar_tx_hash": "3389e9f0f73b654dd0c09b3e933a29566e3716e0885b937657f6829496386fd2"
  }
  ```
- **Response**: `200 OK` with status `executed`.

---

## 6. Frontend Integration

Frontend components located under `frontend/src/components/multisig/`:

- **`MultiSigProposalList`**: Displays community proposals filtered by status (`pending`, `approved`, `executed`, `rejected`) with signature progress indicators.
- **`MultiSigProposalDetail`**: Detailed view displaying proposal parameters, required vs current signatures, signer address list, and interactive **Approve & Sign**, **Reject**, and **Execute** buttons.
- **`BatchDisbursementForm`**: Modal / form for creating multi-destination batch disbursements with CSV upload or manual row entry.
- **`useMultiSig` Hook**: SWR-powered hook managing client-side proposal querying, signing with Freighter, and optimistic UI updates.

---

## 7. Security & Operational Guarantees

1. **Transaction Time Bounds**: All multi-sig envelopes enforce strict `minTime` and `maxTime` bounds. If co-signers do not meet threshold before `maxTime`, the envelope expires safely without risk of late execution.
2. **Deterministic Sequence Numbers**: Envelopes are built against the current sequence number of the source treasury account.
3. **Weight Integrity Checks**: The backend verifies that the sum of signer weights can mathematically satisfy the medium threshold before accepting a proposal.
4. **Immutable Action Records**: Once created, proposal payloads cannot be altered; any change requires creating a new proposal.
