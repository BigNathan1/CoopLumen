# CoopLumen Security Model

This document records the security boundaries, principal threats, and required controls for CoopLumen. It applies to the web client, API, PostgreSQL database, CI/CD system, and Stellar transactions created or submitted by the platform.

## Assets

- Stellar accounts, signatures, transaction envelopes, balances, and community assets.
- Session tokens, webhook secrets, administrative configuration, and deployment credentials.
- Member identity, KYC records, loan history, reputation scores, notifications, and audit records.
- Community membership, roles, governance proposals, treasury policy, and multisig approvals.
- Source code, build artifacts, container images, database backups, and security reports.

CoopLumen does not store users' Stellar secret keys. Wallet signing remains in the user's wallet; server-managed signing keys, where explicitly configured for an operator function, must be supplied only through the deployment secret store.

## Trust Boundaries

1. **Browser to API:** all input is untrusted. Production traffic must use HTTPS, authenticated routes must verify the server-issued session, and state-changing browser requests must pass CSRF protection.
2. **API to PostgreSQL:** the API is the only public data path. Queries use parameters, database roles use least privilege, and migrations are reviewed before deployment.
3. **API to Stellar:** Horizon responses and submitted XDR are external input. Network passphrases, source accounts, time bounds, operations, and expected signers must be checked before signing or submission.
4. **External providers to webhooks:** deliveries are accepted only after HMAC verification and replay-window checks. Payloads are still validated after authentication.
5. **CI/CD to runtime:** protected branches, required reviews, mandatory security jobs, pinned actions, scoped tokens, signed or digest-addressed images, and environment approvals protect this boundary.
6. **Operators to production:** administrative access is allowlisted, audited, protected with strong authentication, and separated from ordinary community roles.

## Threat Model

| Threat | Attack path | Required controls | Residual risk |
| --- | --- | --- | --- |
| Account impersonation | Stolen or forged session, replayed wallet challenge | Signed nonce challenge, short expiry, one-time nonce, secure HttpOnly cookie, exact address binding, rate limits | Compromised wallet or browser can act as its owner |
| Broken authorization | Access another member's loan, KYC, export, or admin action | Deny-by-default route guards, owner checks, community RBAC, operator allowlist, integration tests | New routes may omit a guard without review |
| Injection | Crafted JSON, query, path, CSV, or webhook data | Zod validation, parameterized SQL, output encoding, CSP, no shell interpolation of user data | Third-party parsers may contain defects |
| Cross-site scripting | Stored community, proposal, or notification text | React escaping, explicit HTML sanitization, strict CSP, no unsafe HTML sinks | Browser extensions and compromised dependencies remain outside the boundary |
| Cross-site request forgery | Malicious site sends authenticated writes | SameSite session cookie, CSRF token validation, origin controls | User-approved wallet prompts may still authorize malicious intent |
| Sensitive-data disclosure | Logs, exports, errors, backups, or over-broad queries | Structured log redaction, owner-only exports, generic errors, encrypted backups, least privilege, retention policy | Authorized operators can access production data for support |
| Stellar transaction tampering | Substitute network, source, operation, amount, memo, or destination | Reconstruct and display intent, verify XDR fields and time bounds, fixed network configuration, wallet signs final envelope | A compromised wallet UI can misrepresent intent |
| Replay and duplicate execution | Reuse webhook, transaction, or approval | Nonces, timestamps, idempotency keys, unique transaction hashes, Stellar sequence numbers | Network retries can delay finality feedback |
| Privilege escalation | Change membership role, threshold, or signer set | Admin/treasurer authorization, multisig threshold, audit trail, before/after records | Colluding authorized signers can approve a malicious action |
| Supply-chain compromise | Malicious package, action, image, or build output | Lockfiles, pinned actions, required npm audit and Trivy jobs, isolated builds, minimal tokens | A trusted upstream may be compromised before disclosure |
| Availability attack | API floods, expensive queries, provider outage | Per-route rate limits, slowdown, bounded pagination, pool limits, timeouts, health checks, rollback | Stellar, database, or hosting outages can still interrupt service |

## Data Protection

- Collect only data needed for membership, lending, compliance, governance, and security operations.
- Classify KYC and provider metadata as restricted. Never place it in application logs or analytics.
- Encrypt production traffic and backups, restrict backup access, and test restoration.
- Define retention periods for KYC, audit, notification, and inactive-account data according to applicable legal requirements.
- Provide authenticated owner export and deletion workflows. Legal holds and immutable financial records must be documented to the requester when deletion cannot apply.
- Review database grants and operator access at least quarterly and revoke access immediately when responsibilities change.

## Detection and Response

Security-relevant authentication, authorization, membership, loan, signing, and administrative actions must create structured audit events without secrets. Alerts should cover repeated authentication failures, denied operator actions, unusual exports, signature failures, dependency findings, and high-risk ZAP results.

For an incident: preserve evidence, rotate affected credentials, contain the affected service, identify impacted accounts and transactions, restore from trusted artifacts, notify affected parties as required, and publish a blameless remediation record. See `SECURITY.md` for private vulnerability reporting.

## Review Cadence

- Run dependency and container audits on every pull request.
- Run the ZAP baseline against staging after a successful staging deployment and review every medium-or-higher alert before release.
- Review this model for every new trust boundary and at least quarterly.
- Perform an internal review of authentication, authorization, Stellar signing, secrets, and logging before each major release.
