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

| Contributor                                                           | Points | Merged PRs             |
| --------------------------------------------------------------------- | -----: | ---------------------- |
| [EzeanoroEbuka](https://github.com/EzeanoroEbuka)                     |     17 | #823, #822, #821, #820 |
| [DevQwinB](https://github.com/DevQwinB)                               |     16 | #827, #826, #825, #824 |
| [funmilayo-ui](https://github.com/funmilayo-ui)                       |     11 | #785, #783, #782       |
| [DevTobis](https://github.com/DevTobis)                               |     11 | #830, #829, #807       |
| [delightonyedikachipixel](https://github.com/delightonyedikachipixel) |     10 | #833, #832, #831       |
| [Hallab7](https://github.com/Hallab7)                                 |      8 | #581                   |
| [promisszn](https://github.com/promisszn)                             |      6 | #794                   |
| [isaac4real-art](https://github.com/isaac4real-art)                   |      4 | #791                   |
| [royalTreasure](https://github.com/royalTreasure)                     |      4 | #828                   |
| [IFEANYIBRIGHT](https://github.com/IFEANYIBRIGHT)                     |      3 | #819                   |
| [quickweb-stack](https://github.com/quickweb-stack)                   |      3 | #814                   |
| [shemaiahdelia03-cmd](https://github.com/shemaiahdelia03-cmd)         |      3 | #801                   |
| [V1ctor-o](https://github.com/V1ctor-o)                               |      3 | #802                   |
| [001marvelqueen-blip](https://github.com/001marvelqueen-blip)         |      3 | #780                   |
| [Jumongweb](https://github.com/Jumongweb)                             |      2 | #809                   |

## Ledger

### 2026-09-30 — batch review of the open pull-request backlog

Twenty-six pull requests reviewed and merged. Context worth recording: every open
PR was failing CI because of a single unused-variable ESLint error on `main`
(`backend/src/api/routes/__tests__/stream.test.ts`), not because of anything the
contributors wrote. That was fixed first, and the CI frontend job was switched to
`--runInBand` to stop load-sensitive suites failing on timing.

- **+4** — [DevQwinB](https://github.com/DevQwinB) — [#827](https://github.com/BigNathan1/CoopLumen/pull/827) `authenticateJWT` middleware: cookie-first with a Bearer fallback, and a cookie when present is never combined with the header — closing off pairing a valid Bearer token with a forged cookie. Maintainer kept both this and `requireRole` from #828 in the shared file.
- **+5** — [DevQwinB](https://github.com/DevQwinB) — [#825](https://github.com/BigNathan1/CoopLumen/pull/825) rotating refresh tokens: the presented token is invalidated and replaced, so a replayed token returns 401. Merge required combining with #824 so `/verify` sets both the session and refresh cookies; taking either side alone would have silently dropped one.
- **+4** — [DevQwinB](https://github.com/DevQwinB) — [#824](https://github.com/BigNathan1/CoopLumen/pull/824) session token in an httpOnly, SameSite=Strict cookie plus the response body, so browsers and API clients share one code path. Challenges are consumed whether or not the signature verifies.
- **+3** — [DevQwinB](https://github.com/DevQwinB) — [#826](https://github.com/BigNathan1/CoopLumen/pull/826) idempotent public logout, honest in its own docs that stateless tokens are not revoked by it.
- **+5** — [EzeanoroEbuka](https://github.com/EzeanoroEbuka) — [#823](https://github.com/BigNathan1/CoopLumen/pull/823) `useAddMember` and `useIssueToken` (#340, #341), with correct cache revalidation and a properly sequenced Freighter signing flow. Added 3 test suites.
- **+4** — [EzeanoroEbuka](https://github.com/EzeanoroEbuka) — [#822](https://github.com/BigNathan1/CoopLumen/pull/822) token issuance hook: unsigned payment, wallet signature, submit, then refresh balances and the token list.
- **+4** — [EzeanoroEbuka](https://github.com/EzeanoroEbuka) — [#821](https://github.com/BigNathan1/CoopLumen/pull/821) Freighter token transfer hook.
- **+4** — [EzeanoroEbuka](https://github.com/EzeanoroEbuka) — [#820](https://github.com/BigNathan1/CoopLumen/pull/820) `useCreateCommunity` (#339). Its `{ submit, loading, error }` contract, which rethrows on failure, is what lets `CreateCommunityForm` map field-level API errors; a competing rewrite in #803 was declined for replacing it.
- **+4** — [DevTobis](https://github.com/DevTobis) — [#807](https://github.com/BigNathan1/CoopLumen/pull/807) wallet auto-reconnect together with Freighter account/network change detection — the right pair to ship together.
- **+4** — [DevTobis](https://github.com/DevTobis) — [#829](https://github.com/BigNathan1/CoopLumen/pull/829) ten more `CreateCommunityForm` cases including API field errors mapping onto the right inputs. Conflict resolved as the union of two mock setups (17/17 passing).
- **+3** — [DevTobis](https://github.com/DevTobis) — [#830](https://github.com/BigNathan1/CoopLumen/pull/830) expanded `CommunityList` tests.
- **+4** — [funmilayo-ui](https://github.com/funmilayo-ui) — [#785](https://github.com/BigNathan1/CoopLumen/pull/785) community treasury overview page.
- **+4** — [funmilayo-ui](https://github.com/funmilayo-ui) — [#783](https://github.com/BigNathan1/CoopLumen/pull/783) community transactions page.
- **+3** — [funmilayo-ui](https://github.com/funmilayo-ui) — [#782](https://github.com/BigNathan1/CoopLumen/pull/782) `TransactionHistory` table component.
- **+4** — [delightonyedikachipixel](https://github.com/delightonyedikachipixel) — [#833](https://github.com/BigNathan1/CoopLumen/pull/833) `GET /auth/challenge/:publicKey`.
- **+3** — [delightonyedikachipixel](https://github.com/delightonyedikachipixel) — [#832](https://github.com/BigNathan1/CoopLumen/pull/832) hook unit tests via `renderHook`.
- **+3** — [delightonyedikachipixel](https://github.com/delightonyedikachipixel) — [#831](https://github.com/BigNathan1/CoopLumen/pull/831) `useStellarAccount`.
- **+6** — [promisszn](https://github.com/promisszn) — [#794](https://github.com/BigNathan1/CoopLumen/pull/794) community tokens view, `TransactionHistory` with coverage, custom 404, and quorum-checked proposal finalization. Squash-merged so the commit is authored by the contributor and no Claude attribution reaches `main`.
- **+4** — [isaac4real-art](https://github.com/isaac4real-art) — [#791](https://github.com/BigNathan1/CoopLumen/pull/791) made `get_proposal` dependable (#504): `NotInitialized` now distinguishable from `ProposalNotFound`, so the UI can render an empty state instead of an error. Additive conflict resolved keeping both test suites (21 tests).
- **+4** — [royalTreasure](https://github.com/royalTreasure) — [#828](https://github.com/BigNathan1/CoopLumen/pull/828) `requireRole(roles[])` RBAC middleware. An empty roles list matches nobody, so it fails closed — the correct default, and tested deliberately.
- **+3** — [IFEANYIBRIGHT](https://github.com/IFEANYIBRIGHT) — [#819](https://github.com/BigNathan1/CoopLumen/pull/819) light-mode governance, activity, identity and transaction design work.
- **+3** — [quickweb-stack](https://github.com/quickweb-stack) — [#814](https://github.com/BigNathan1/CoopLumen/pull/814) page transitions that release the compositor layer on `animationend` rather than leaving `will-change` set. Maintainer replaced an `eslint-disable` for an unloaded rule with `void el.offsetHeight`.
- **+3** — [shemaiahdelia03-cmd](https://github.com/shemaiahdelia03-cmd) — [#801](https://github.com/BigNathan1/CoopLumen/pull/801) CI/CD architecture docs.
- **+3** — [V1ctor-o](https://github.com/V1ctor-o) — [#802](https://github.com/BigNathan1/CoopLumen/pull/802) `app/error.tsx` (#322), reusing existing design tokens and keeping error digests out of the UI. Merged green on its first real CI run.
- **+3** — [001marvelqueen-blip](https://github.com/001marvelqueen-blip) — [#780](https://github.com/BigNathan1/CoopLumen/pull/780) USD equivalent on each balance (#295).
- **+2** — [Jumongweb](https://github.com/Jumongweb) — [#809](https://github.com/BigNathan1/CoopLumen/pull/809) wallet connect test coverage.

- **2026-09-30** — [EzeanoroEbuka](https://github.com/EzeanoroEbuka) — **+5 points** — [#823](https://github.com/BigNathan1/CoopLumen/pull/823) _"add useAddMember and useIssueToken mutation hooks"_: two SWR-backed mutation hooks closing #340 and #341, with correct cache revalidation after both mutations and a properly sequenced Freighter signing flow. Added 3 test suites (frontend suite 1103 → 1111 tests). Maintainer applied a prettier-only formatting pass and resolved an additive CHANGELOG conflict on merge; no contributor logic was changed.
- **2026-09-30** — [V1ctor-o](https://github.com/V1ctor-o) — **+3 points** — [#802](https://github.com/BigNathan1/CoopLumen/pull/802) _"add App Router error page"_: `app/error.tsx` closing #322, reusing the existing `ErrorBoundary.module.css` design tokens instead of one-off styles, keeping error digests out of the UI, and covering the message, keyboard retry, and detail-suppression with tests. Merged green on first CI run.
- **2026-08-27** — [Hallab7](https://github.com/Hallab7) — **+8 points** — [#581](https://github.com/BigNathan1/CoopLumen/pull/581) _"add Stellar transaction and database foundation work"_ (merged via [#583](https://github.com/BigNathan1/CoopLumen/pull/583)): a new unsigned-payment XDR endpoint, a paginated balance-history audit endpoint, a completed database ERD, and a genuinely-fresh-database migration integration suite — four issues (#54, #56, #145, #146) closed in one well-tested, well-documented PR.
