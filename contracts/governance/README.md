# CoopLumen Governance contract

Soroban smart contract behind on-chain community governance: members create
proposals and cast votes whose weight is their balance of a configured
governance token, and the resulting proposal records are read straight off the
chain instead of from a backend that has to be trusted.

- **Crate:** `cooplumen-governance` (`contracts/governance`)
- **SDK:** `soroban-sdk` 27.0.6
- **Workspace member:** declared in the root `Cargo.toml`

## Data model

| Type             | Fields                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Config`         | `admin`, `governance_token`, `voting_period` (seconds), `quorum_bps` (basis points, at most `10_000`)                                             |
| `Proposal`       | `proposal_id`, `proposer`, `title`, `description`, `actions: Vec<String>`, `votes_for`, `votes_against`, `status`, `created_at`, `voting_ends_at` |
| `Vote`           | `voter`, `choice`, `weight`                                                                                                                       |
| `ProposalStatus` | `Active`, `Passed`, `Rejected`, `Executed`                                                                                                        |
| `VoteChoice`     | `For`, `Against`                                                                                                                                  |

State is addressed through the `DataKey` enum:

| Key                  | Holds                                      |
| -------------------- | ------------------------------------------ |
| `Config`             | The deployed `Config`                      |
| `Proposal(u64)`      | One `Proposal`, keyed by its proposal id   |
| `Vote(u64, Address)` | One `Vote`, keyed by proposal id and voter |
| `ProposalCount`      | The last assigned `proposal_id`            |

Every record is keyed individually, so a lookup by `proposal_id` neither scans
nor disturbs any other proposal's record.

## Interface

### `initialize(admin, governance_token, voting_period, quorum_bps)`

Writes the singleton `Config`. Fails with `AlreadyInitialized` if the contract
was already initialized, and with `InvalidInput` when `voting_period` is zero or
`quorum_bps` exceeds `10_000`.

### `create_proposal(proposer, title, description, actions) -> u64`

Requires `proposer` auth, assigns the next `proposal_id`, stamps `created_at`
from the ledger timestamp and `voting_ends_at` as
`created_at + voting_period`, and stores the proposal as `Active`. Fails with
`NotInitialized` before `initialize` and with `InvalidInput` on an empty title.

### `cast_vote(proposal_id, choice, voter)`

Requires `voter` auth, reads the caller's balance of `governance_token` and adds
it to the tally for `choice`. Fails with `ProposalNotFound`, `ProposalNotActive`,
`VotingPeriodEnded`, `AlreadyVoted` or `NoVotingPower` as appropriate; the
guards run before any write, so a rejected vote leaves no partial state behind.

### `get_config() -> Config`

Returns the active `Config`, or `NotInitialized`.

### `get_proposal(proposal_id) -> Proposal`

The read side of the contract, and the view the off-chain layers surface:

- Returns the proposal's `proposer`, `title`, `description`, encoded `actions`,
  the running `votes_for` / `votes_against` tallies, the lifecycle `status` and
  the `created_at` / `voting_ends_at` voting window.
- Requires no auth and mutates no state, so it is safe to call from a
  simulation or read-only invocation.
- Errors:
  - `NotInitialized` if the contract has not been initialized yet — the same
    error `get_config` returns, which lets a caller distinguish "not deployed
    yet" from "no such proposal".
  - `ProposalNotFound` if the contract is initialized but `proposal_id` was
    never assigned.

### `get_vote(proposal_id, voter) -> Vote`

Returns the `Vote` that `voter` cast on `proposal_id`.

## Errors

| Code | Name                 | Raised when                                                     |
| ---- | -------------------- | --------------------------------------------------------------- |
| 1    | `AlreadyInitialized` | `initialize` is called on an initialized contract               |
| 2    | `NotInitialized`     | Any call before `initialize`                                    |
| 3    | `InvalidInput`       | Empty title, zero voting period, or quorum above `10_000` bps   |
| 4    | `ProposalNotFound`   | Unknown `proposal_id`, or no vote from that voter on a proposal |
| 5    | `ProposalNotActive`  | Voting on a proposal whose status is no longer `Active`         |
| 6    | `VotingPeriodEnded`  | Voting after `voting_ends_at`                                   |
| 7    | `AlreadyVoted`       | The same address voting twice on one proposal                   |
| 8    | `NoVotingPower`      | The voter's governance-token balance is zero                    |
| 9    | `Overflow`           | Counter or tally arithmetic overflow                            |

## Development

```bash
cargo test -p cooplumen-governance   # unit tests (soroban-sdk testutils)
cargo fmt --check -p cooplumen-governance
```

The tests live in the `test` module of `src/lib.rs` and register a Stellar asset
contract as the governance token, so token-weighted tallies run against real
balances with mocked auth.
