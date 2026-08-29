# Changelog

All notable changes to CoopLumen are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- `GET /api/v1/transactions/:hash` endpoint for single transaction detail fetched from Horizon (#118).
- `StellarService.getTransaction(hash)` method wrapping Horizon transaction retrieval with retry and error mapping.
- OpenAPI spec updates and comprehensive unit test coverage for transaction detail retrieval.
