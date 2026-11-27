# Stellar Transaction Signing Security Review

Review date: 2026-11-21

Scope: transaction construction, XDR parsing, server and wallet signing,
submission, batch payments, network selection, secrets, logging, and relevant
API boundaries under `backend/src/contracts` and `backend/src/api`.

## Security Invariants

- Member keys stay in the member's wallet. The normal flow is build unsigned
  XDR, show the complete intent, wallet-sign the final envelope, then submit it.
- A server-held key may sign only for its configured public account. Missing or
  mismatched signer configuration fails closed.
- Every build, parse, hash, sign, and submit operation uses the configured
  Stellar network passphrase. A signature is therefore bound to that network.
- Amounts use positive decimal strings with at most seven decimal places;
  public keys, asset codes, memos, operation counts, and XDR are validated at
  their API boundary.
- Secret seeds and signed envelopes are never logged, cached, returned in
  errors, or stored in the database.

## Flow Reviewed

1. `buildUnsignedPayment` loads the source account from Horizon, uses its
   sequence, sets a timeout, and creates a single payment operation.
2. The browser wallet signs that XDR after displaying the intended network,
   source, destination, asset, amount, fee, memo, and time bounds.
3. `submitSignedXdr` parses with the configured passphrase and submits to the
   configured Horizon server. Horizon enforces sequence, authorization, and
   operation validity.
4. Server signing in `signing.ts` validates the secret, allowlists its derived
   public key, parses XDR with the configured passphrase, and avoids duplicate
   signatures.

## Findings and Disposition

| Severity | Finding                                                                                                                          | Disposition                                                                                                                                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | `POST /batch/disburse` accepts a sender seed for legacy batch execution.                                                         | Hardened in this change: authentication and write throttling are mandatory, the derived signer must equal the authenticated Stellar account, and responses are `no-store`. Migrate clients to `/batch/preview`, wallet signing, and `/transactions/submit`; then remove the legacy route. |
| Medium   | The exported `allowedSigners` override in `signing.ts` broadens the default distributor allowlist if a future caller misuses it. | No production caller exists. Keep the helper internal to reviewed treasury code and remove the override when its first concrete call site is introduced.                                                                                                                                  |
| Medium   | Generic signed-XDR submission cannot prove the user's intended destination or amount by itself.                                  | Wallet confirmation is the authorization boundary. Clients must decode and display the final XDR; privileged server workflows must compare it with persisted intent before submission.                                                                                                    |
| Low      | Horizon availability and stale sequence numbers can reject otherwise valid envelopes.                                            | Builders load a current account and sequence; callers surface mapped errors and rebuild rather than re-signing stale XDR.                                                                                                                                                                 |

No flow logs a seed or persists one in the application database. Repository
secret scanning, dependency auditing, and code review remain required because a
compromised dependency inside the signing process could bypass application
controls.

## Release Checklist

- Confirm production network and Horizon URL are explicit and mutually
  consistent; never infer production from a client request.
- Confirm distributor public key and secret resolve to the same account without
  printing either secret material or the full environment.
- Exercise testnet transfers, wrong-network XDR, expired time bounds, duplicate
  submission, wrong signer, and insufficient-signature paths.
- Inspect logs and error monitoring for seed, authorization, cookie, and XDR
  leakage using synthetic markers.
- Rotate a signing credential through the documented secret-store procedure and
  confirm the retired credential can no longer authorize a transaction.
