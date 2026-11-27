# CoopLumen Mainnet Go-Live Checklist

**Purpose:** Final verification before Stellar Mainnet launch  
**Status:** Ready for deployment team  
**Version:** 1.0

---

## Overview

This checklist ensures CoopLumen is secure, operational, and ready for production launch. Every item must be completed before the go/no-go decision.

**Phases:**

1. **Security & Audit** — Verify security controls
2. **Configuration** — Verify Mainnet configuration
3. **Deployment** — Verify deployment readiness
4. **Testing** — Verify functionality
5. **Monitoring** — Verify observability
6. **Documentation** — Verify user/ops docs
7. **Launch** — Approved to launch

---

## Phase 1: Security & Audit

### Issue #577 — External Security Audit Readiness

- [ ] **Security review completed** — Focused review of contracts, API, frontend (completed in-house)
- [ ] **Vulnerabilities addressed** — Critical/High findings fixed or accepted
- [ ] **audit-readiness.md created** — Security overview, threat model, controls documented
- [ ] **Security audit engagement prepared** — Package ready to send to external auditor
- [ ] **Dependency audit passing** — `npm audit` shows no high-severity production issues
- [ ] **Container scan passing** — Trivy scan shows no critical vulnerabilities

### External Audit Status

- [ ] **Audit firm selected** — [Firm Name] engaged
- [ ] **Audit RFP/contract signed** — Dates, scope, deliverables agreed
- [ ] **Audit underway or scheduled** — Kickoff date [DATE]
- [ ] **Initial findings received** — [Optional if ongoing]
- [ ] **Critical findings addressed** — If audit complete, all Critical/High fixed
- [ ] **Retest completed** — Auditor confirmed fixes
- [ ] **Audit sign-off obtained** — Final report received

**If audit not yet complete:**

- [ ] Timeline to completion: [DATE]
- [ ] Impact on launch: [TIMELINE IMPACT]
- [ ] Mitigation: Launch on Testnet first, migrate to Mainnet after audit

---

## Phase 2: Stellar Mainnet Configuration

### Issue #578a — Network Configuration

- [ ] **Network selection** — `STELLAR_NETWORK=mainnet` configured (not inferred)
- [ ] **Horizon endpoint correct** — `STELLAR_HORIZON_URL=https://horizon.stellar.org` (official endpoint)
- [ ] **Network passphrase** — Public Global (Mainnet) not Testnet
- [ ] **No Testnet artifacts** — All contract IDs and keys are Mainnet-native
- [ ] **Environment validation** — Startup fails if required config missing
- [ ] **No placeholder values** — All config values are actual (not example text)

### Secrets Management

- [ ] **AUTH_SESSION_SECRET set** — Random 32+ byte secret (not empty, not default)
- [ ] **ADMIN_ADDRESSES configured** — At least one Mainnet admin public key
- [ ] **Secrets never in git** — `.env.production` in `.gitignore`
- [ ] **Secrets never in logs** — No private keys logged anywhere
- [ ] **Webhook secrets configured** — `STELLAR_WEBHOOK_SECRET` and `KYC_WEBHOOK_SECRET` set

---

## Phase 3: Issuer Account

### Issue #578b — Issuer Account Funding

- [ ] **Mainnet issuer account created** — Public key generated and secured
- [ ] **Private key stored securely** — HSM, Vault, or encrypted (never in git or logs)
- [ ] **Mainnet issuer funded** — At least 10 XLM on actual Mainnet account
- [ ] **Funding verified** — Account balance confirmed via Horizon API
- [ ] **Configuration recorded** — `STELLAR_MAINNET_ISSUER_PUBLIC_KEY` set in environment
- [ ] **Issuer account is active** — No errors when account queried on Mainnet

---

## Phase 4: Governance Contract

### Issue #578c — Contract Deployment

- [ ] **Contract builds successfully** — `cargo build --release` passes
- [ ] **Contract tests pass** — `cargo test --release` shows all tests passing
- [ ] **Testnet deployment verified** — Same contract deployed and tested on Testnet first
- [ ] **Contract deployed to Mainnet** — Deployment transaction confirmed (contract ID starts with 'C')
- [ ] **Contract initialized** — `initialize()` called with Mainnet parameters
- [ ] **Contract config verified** — `get_config()` returns expected governance parameters
- [ ] **Contract address recorded** — `STELLAR_MAINNET_GOVERNANCE_CONTRACT_ID` saved
- [ ] **Deployment TX hash saved** — Transaction recorded for audit trail

---

## Phase 5: Backend Deployment

- [ ] **Backend builds without errors** — `npm run build` succeeds
- [ ] **Lint passes** — `npm run lint` has no errors
- [ ] **Type-check passes** — `npm run type-check` has no errors
- [ ] **Backend tests pass** — `npm test` shows all tests passing
- [ ] **Integration tests pass** — Contract integration tests passing
- [ ] **Database migrations ready** — Latest migrations tested on Mainnet database
- [ ] **Docker image builds** — `docker build -t cooplumen-backend:latest ./backend` succeeds
- [ ] **No secrets in Docker image** — Image scan shows no hardcoded credentials

---

## Phase 6: Frontend Deployment

- [ ] **Frontend builds without errors** — `npm run build` succeeds
- [ ] **Lint passes** — `npm run lint` has no errors
- [ ] **Type-check passes** — `npm run type-check` has no errors
- [ ] **Frontend tests pass** — `npm test` has no failing tests
- [ ] **E2E tests pass** — Playwright suite passes on production-like environment
- [ ] **Docker image builds** — `docker build -t cooplumen-frontend:latest ./frontend` succeeds
- [ ] **Environment variables injected correctly** — API_URL and STELLAR_NETWORK match Mainnet

---

## Phase 7: Testing & Verification

### Smoke Tests

- [ ] **Application starts without errors** — No crash on startup
- [ ] **Health check endpoint responds** — `GET /api/v1/health` returns 200
- [ ] **All health checks green** — Database, Redis, Stellar connectivity all "ok"
- [ ] **Frontend loads** — Homepage accessible
- [ ] **Can connect wallet** — Freighter integration works
- [ ] **Can create community** — Full community creation flow succeeds
- [ ] **Can create proposal** — Governance contract interaction works
- [ ] **Can vote on proposal** — Vote submission succeeds

### Network Verification

- [ ] **Stellar connectivity confirmed** — Can reach `https://horizon.stellar.org`
- [ ] **Issuer account queryable** — Account found on Mainnet via Horizon
- [ ] **Governance contract queryable** — Contract exists on Mainnet via Horizon
- [ ] **Network passphrase correct** — Transactions signed with Mainnet passphrase

### Performance Tests

- [ ] **API response times acceptable** — p99 latency < 500ms
- [ ] **Database queries fast** — Query latency < 100ms
- [ ] **No memory leaks** — Memory usage stable over 30 minutes
- [ ] **Can handle expected load** — Load test to 10 RPS passes

---

## Phase 8: Production Monitoring

- [ ] **Health check endpoint implemented** — `GET /api/v1/health` returns status + checks
- [ ] **Structured logging configured** — Critical events logged with context
- [ ] **Error logging active** — Errors captured and formatted consistently
- [ ] **Stellar error handling** — Transaction failures logged with details
- [ ] **Database error handling** — Connection and query failures logged
- [ ] **Rate limiting active** — Per-endpoint limits configured
- [ ] **Monitoring configured** — Health checks, logs, metrics accessible
- [ ] **Alerting configured** — Critical alerts can be triggered (manual or integrated)
- [ ] **Runbooks documented** — Incident response procedures written
- [ ] **On-call process defined** — Team knows who monitors post-launch

---

## Phase 9: Documentation

### User Documentation

- [ ] **README updated** — Mentions Mainnet availability
- [ ] **Getting started guide** — Users can create account and community
- [ ] **API documentation** — OpenAPI spec reflects production endpoints
- [ ] **FAQ published** — Common questions answered
- [ ] **Support contact** — Email or chat support configured

### Operational Documentation

- [ ] **audit-readiness.md** — Security controls documented
- [ ] **configuration.md** — Network setup documented
- [ ] **issuer-setup.md** — Issuer account procedure documented
- [ ] **governance-contract-deployment.md** — Contract deployment documented
- [ ] **production-monitoring.md** — Monitoring and alerting documented
- [ ] **Incident response guide** — Procedures for common scenarios documented
- [ ] **Rollback plan** — Steps to rollback documented and tested

### Security & Audit Documentation

- [ ] **security-audit-engagement.md** — Audit engagement process documented
- [ ] **CHANGELOG.md** — Changes documented under [Unreleased] or versioned
- [ ] **SECURITY.md** — Vulnerability reporting policy in place

---

## Phase 10: Launch Preparation

### Announcement

- [ ] **launch-announcement.md written** — Publication-ready announcement
- [ ] **Press release drafted** — Key messages documented
- [ ] **Social media posts drafted** — Announcements ready to publish
- [ ] **Blog post drafted** — Technical/community blog content ready
- [ ] **Email to community drafted** — User notification ready

### Team Readiness

- [ ] **All-hands launch call scheduled** — Team aligned on timeline
- [ ] **On-call rotation assigned** — Team coverage for 24 hours post-launch
- [ ] **Escalation contacts documented** — Who to notify if critical issue
- [ ] **Communication channels ready** — Slack, Discord, email configured
- [ ] **Incident command procedure documented** — How to respond to issues
- [ ] **Rollback decision criteria documented** — When to rollback (not auto)

### Deployment Procedure

- [ ] **Deployment order verified** — Database, backend, frontend sequence
- [ ] **Deployment script tested** — Blue/green deployment works on staging
- [ ] **DNS/load balancer configured** — Traffic points to Mainnet deployment
- [ ] **SSL/TLS certificates** — Valid certificates for all domains
- [ ] **CORS configured** — Frontend can call backend on Mainnet

---

## Phase 11: Final Verification (24 Hours Before Launch)

### Systems Check

- [ ] **Database is ready** — Migrations applied, backups scheduled
- [ ] **Secrets are secure** — No secrets in version control or logs
- [ ] **Monitoring is online** — All monitoring, logging, alerts active
- [ ] **Backup procedure tested** — Can restore from backup if needed
- [ ] **CI/CD pipeline green** — All tests passing on main branch

### Team Readiness

- [ ] **Team briefed** — Everyone knows the schedule and their role
- [ ] **On-call team ready** — Coverage arranged for 24 hours post-launch
- [ ] **Support team trained** — Can handle early user issues
- [ ] **Communication draft approved** — Announcement ready to publish

### Final Checklist (Launch Day, 1 Hour Before)

- [ ] **Application running locally** — Smoke test passes on staging
- [ ] **Mainnet connectivity verified** — Can reach Horizon
- [ ] **Deployment account funded** — Has sufficient XLM
- [ ] **All environment variables correct** — No Testnet artifacts
- [ ] **Health check green** — All systems operational
- [ ] **Team in communication** — All members on-call and aware
- [ ] **Go/no-go decision ready** — Decision maker available

---

## Phase 12: Launch Approval

### Decision Maker Sign-Off

**Before launching to Mainnet, the following must be confirmed:**

- [ ] **CTO / Technical Lead:** "Code is production-ready"
- [ ] **Product Lead:** "Feature set is complete for Mainnet"
- [ ] **Security Lead:** "Security review is complete; risks accepted"
- [ ] **Operations:** "Monitoring and rollback ready"
- [ ] **Executive Sponsor:** "Launch is approved; go/no-go decision: GO"

### No-Go Criteria

**Do not launch if any of the following are true:**

- ❌ Critical security vulnerabilities are unresolved
- ❌ External audit indicates severe issues requiring redesign
- ❌ Database cannot be backed up or restored
- ❌ Mainnet connectivity is unavailable
- ❌ Team is not available for 24-hour post-launch monitoring
- ❌ Announcement has not been reviewed and approved
- ❌ Incident response procedure is not practiced
- ❌ Any core functionality fails smoke test

---

## Post-Launch (24 Hours)

### Continuous Monitoring

- [ ] **System operational** — No crashes or critical errors
- [ ] **Health checks passing** — All systems green
- [ ] **Users can onboard** — Community creation working
- [ ] **Transactions processing** — Payments, votes, transfers succeeding
- [ ] **No data loss** — Database integrity verified
- [ ] **Performance acceptable** — Response times normal

### Post-Launch Retrospective (End of Day 1)

- [ ] **Issues captured** — Any bugs or incidents documented
- [ ] **Root cause analysis** — Why did issues occur?
- [ ] **Fixes planned** — How to prevent recurrence?
- [ ] **Team debriefs** — Lessons learned documented
- [ ] **Next steps** — Updates to monitoring, docs, procedures

---

## Sign-Off

| Role                  | Printed Name               | Signature                  | Date     |
| --------------------- | -------------------------- | -------------------------- | -------- |
| **CTO / Tech Lead**   | **\*\*\*\***\_**\*\*\*\*** | **\*\*\*\***\_**\*\*\*\*** | \_\_\_\_ |
| **Product Lead**      | **\*\*\*\***\_**\*\*\*\*** | **\*\*\*\***\_**\*\*\*\*** | \_\_\_\_ |
| **Security Lead**     | **\*\*\*\***\_**\*\*\*\*** | **\*\*\*\***\_**\*\*\*\*** | \_\_\_\_ |
| **Operations**        | **\*\*\*\***\_**\*\*\*\*** | **\*\*\*\***\_**\*\*\*\*** | \_\_\_\_ |
| **Executive Sponsor** | **\*\*\*\***\_**\*\*\*\*** | **\*\*\*\***\_**\*\*\*\*** | \_\_\_\_ |

---

**Checklist Version:** 1.0  
**Last Updated:** 2026-05-20  
**Next Review:** Post-launch retrospective
