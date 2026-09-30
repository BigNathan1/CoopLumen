# Contributors

CoopLumen recognizes external contributions with a simple points tally, awarded by the maintainer
on merge. This is recognition, not a governance mechanism — see [CONTRIBUTING.md](CONTRIBUTING.md)
for how the project is run.

## How points are awarded

Points are assigned per merged PR based on scope, judged by the maintainer at merge time:

| Points | Scope                                                                           |
| ------ | ------------------------------------------------------------------------------- |
| 1–2    | Small fix, docs correction, or single small test                                |
| 3–5    | One feature/endpoint, a focused refactor, or a meaningful test suite addition   |
| 6–10   | Multi-part PR closing several issues, a new subsystem, or foundational plumbing |

## Leaderboard

| Contributor                                       | Points | Merged PRs |
| ------------------------------------------------- | -----: | ---------- |
| [Hallab7](https://github.com/Hallab7)             |      8 | #581       |
| [EzeanoroEbuka](https://github.com/EzeanoroEbuka) |      5 | #823       |
| [V1ctor-o](https://github.com/V1ctor-o)           |      3 | #802       |

## Ledger

- **2026-09-30** — [EzeanoroEbuka](https://github.com/EzeanoroEbuka) — **+5 points** — [#823](https://github.com/BigNathan1/CoopLumen/pull/823) _"add useAddMember and useIssueToken mutation hooks"_: two SWR-backed mutation hooks closing #340 and #341, with correct cache revalidation after both mutations and a properly sequenced Freighter signing flow. Added 3 test suites (frontend suite 1103 → 1111 tests). Maintainer applied a prettier-only formatting pass and resolved an additive CHANGELOG conflict on merge; no contributor logic was changed.
- **2026-09-30** — [V1ctor-o](https://github.com/V1ctor-o) — **+3 points** — [#802](https://github.com/BigNathan1/CoopLumen/pull/802) _"add App Router error page"_: \`app/error.tsx\` closing #322, reusing the existing \`ErrorBoundary.module.css\` design tokens instead of one-off styles, keeping error digests out of the UI, and covering the message, keyboard retry, and detail-suppression with tests. Merged green on first CI run.
- **2026-08-27** — [Hallab7](https://github.com/Hallab7) — **+8 points** — [#581](https://github.com/BigNathan1/CoopLumen/pull/581) _"add Stellar transaction and database foundation work"_ (merged via [#583](https://github.com/BigNathan1/CoopLumen/pull/583)): a new unsigned-payment XDR endpoint, a paginated balance-history audit endpoint, a completed database ERD, and a genuinely-fresh-database migration integration suite — four issues (#54, #56, #145, #146) closed in one well-tested, well-documented PR.
