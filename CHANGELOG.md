# Changelog

All notable changes to CoopLumen are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- `GET /api/v1/transactions/export/:communityId` returning a CSV of community transaction history (#121).
- `GET /api/v1/fees/estimate` endpoint returning current Stellar network base fee and percentile fee distribution from Horizon (#156).
- `StellarService.getFeeStats()` method wrapping `Horizon.Server.feeStats()` with the existing retry and error-mapping stack.
