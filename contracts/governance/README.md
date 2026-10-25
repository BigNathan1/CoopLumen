# CoopLumen Governance contract

Soroban smart contract behind on-chain community governance: members create
proposals and cast votes whose weight is their balance of a configured
governance token, and the resulting proposal records are read straight off the
chain instead of from a backend that has to be trusted.

- **Crate:** `cooplumen-governance` (`contracts/governance`)
- **SDK:** `soroban-sdk` 27.0.6
- **Workspace member:** declared in the root `Cargo.toml`

## Data model

| Type                     | Fields                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Config`                 | `admin`, `governance_token`, `voting_period` (seconds), `quorum_bps` (basis points, at most `10_000`), `total_supply`                             |
| `Proposal`               | `proposal_id`, `proposer`, `title`, `description`, `actions: Vec<String>`, `votes_for`, `votes_against`, `status`, `created_at`, `voting_ends_at` |
| `Vote`                   | `voter`, `choice`, `weight`                                                                                                                       |
| `GovernanceAnalytics`    | Proposal counts, total voting power cast, turnout, average quorum, and pass rate                                                                  |
| `ProposalStatus`         | `Active`, `Passed`, `Rejected`, `Executed`                                                                                                        |
| `VoteChoice`             | `For`, `Against`                                                                                                                                  |
| `GovernanceRole`         | `Pause`, `Schema`, `Issuer`, `Revocation`, `Upgrade`, `Recovery`                                                                                  |
| `AdminTransferRecord`    | `sequence`, `old_admin`, `proposed_admin`, `actor`, `ledger_sequence`, `timestamp`, `terminal_reason`                                             |
| `PauseTransitionRecord`  | `sequence`, `scope`, `is_paused`, `actor`, `ledger_sequence`, `timestamp`, `incident_commitment`                                                  |
| `PendingUpgradeApproval` | `proposal_id`, `target_hash`, `version`, `expires_at`, `approval_count`                                                                           |
| `PendingAdminTransfer`   | `proposed_admin`, `expires_at`                                                                                                                    |

State is addressed through the `DataKey` enum:

| Key                                       | Holds                                                |
| ----------------------------------------- | ---------------------------------------------------- |
| `Config`                                  | The deployed `Config`                                |
| `Proposal(u64)`                           | One `Proposal`, keyed by its proposal id             |
| `Vote(u64, Address)`                      | One `Vote`, keyed by proposal id and voter           |
| `VoteUsed(u64, Address)`                  | Whether an address's power was counted in a proposal |
| `Delegation(Address)`                     | The delegatee selected by an address                 |
| `Delegators(Address)`                     | Addresses represented by a delegatee                 |
| `ProposalCount`                           | The last assigned `proposal_id`                      |
| `GovernanceRole(Address, GovernanceRole)` | Whether an account holds one operation-scoped role   |
| `AdminHistorySeq`                         | The last admin-transfer history sequence             |
| `AdminTransferHistory`                    | The admin-transfer history, keyed by sequence        |
| `PendingAdminTransfer`                    | The admin transfer awaiting acceptance               |
| `PauseHistorySeq`                         | The last pause-transition history sequence           |
| `PauseHistory`                            | The pause-transition history, keyed by sequence      |
| `PauseScope(String)`                      | Whether one scope is paused                          |
| `PendingUpgrades`                         | The pending upgrades, keyed by proposal id           |
| `PendingUpgradeHashes`                    | Index from an upgrade target hash to its proposal id |
| `UpgradeApprovals(String)`                | The accounts that approved one pending upgrade       |

Every record is keyed individually, so a lookup by `proposal_id` neither scans
nor disturbs any other proposal's record.

## Interface

### `initialize(admin, governance_token, voting_period, quorum_bps, total_supply)`

Writes the singleton `Config`. Fails with `AlreadyInitialized` if the contract
was already initialized, and with `InvalidInput` when `voting_period` is zero,
`quorum_bps` exceeds `10_000`, or `total_supply` is not positive. Initialization
does not currently require authorization, so deployments must initialize
immediately.

### `create_proposal(proposer, title, description, actions) -> u64`

Requires `proposer` auth, assigns the next `proposal_id`, stamps `created_at`
from the ledger timestamp and `voting_ends_at` as
`created_at + voting_period`, and stores the proposal as `Active`. Fails with
`NotInitialized` before `initialize` and with `InvalidInput` on an empty title.

### `cast_vote(proposal_id, choice, voter)`

Requires `voter` auth, reads the caller's balance and the current balances of
accounts delegated to it, and adds that combined governance-token weight to the
tally for `choice`. Every represented address is consumed for that proposal so
its balance cannot be counted again. A delegator must revoke before voting
directly. The guards run before any write, so a rejected vote leaves no partial
state behind.

### `delegate(delegator, delegatee)`

Requires `delegator` auth and delegates its current governance-token voting
power to `delegatee`. Delegation is one hop: self-delegation, cycles, and
delegating onward from an account that represents someone else are rejected.
Balances are resolved when a ballot is cast, so later token transfers are
reflected in the represented weight.

### `undelegate(delegator)`

Requires `delegator` auth and removes its active delegation. The account can
then vote directly on proposals where its power has not already been counted.

### `get_delegation(delegator) -> Option<Address>`

Returns the address currently receiving the account's voting power.

### `get_delegators(delegatee) -> Vec<Address>`

Returns all accounts currently represented by the delegatee.

### `get_config() -> Config`

Returns the active `Config`, or `NotInitialized`.

### `finalize_proposal(proposal_id) -> ProposalStatus`

After the voting window closes, transitions an active proposal to `Passed` when
`votes_for > votes_against`; ties and against majorities become `Rejected`.

### `execute_proposal(proposal_id, executor)`

Requires `executor` auth and a passed proposal whose participation meets the
configured quorum. The current implementation records each opaque action as a
`prop_exec` event for an off-chain executor; it does not dispatch
cross-contract calls.

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

### `get_analytics() -> GovernanceAnalytics`

Returns aggregate metrics computed directly from on-chain proposal records:

- `voter_turnout_bps` is average token participation across every proposal,
  including active ballots so live dashboards move as votes arrive.
- `average_quorum_bps` is average token participation across finalized
  proposals only.
- `proposal_pass_rate_bps` is the share of finalized proposals that passed;
  executed proposals remain successful outcomes.

All rates use basis points (`10_000` = 100%). Participation for an individual
proposal is capped at 100% in analytics, preventing token movement between
ballots from producing a misleading percentage above the configured supply.
Empty collections return zero-valued rates rather than failing division.

## Operation-scoped governance roles

`GovernanceRole` gates one family of operations each: `Pause`, `Schema`,
`Issuer`, `Revocation`, `Upgrade`, and `Recovery`. Every role-gated operation
goes through the same guard, so the role set is the single source of truth for
what an account may do. `initialize` grants every role to the configured admin
so the contract is operable from the first block.

### `grant_role(actor, account, role)` / `revoke_role(actor, account, role)`

Requires `actor` authorization. The admin or an `Upgrade` holder may grant and
revoke the operational roles (`Pause`, `Schema`, `Issuer`, `Revocation`), so
day-to-day role management can be delegated. `Upgrade` and `Recovery` control
the contract itself, so only the admin grants or revokes them; otherwise an
upgrader could grant itself `Recovery` and take the admin seat. Granting a role
twice fails with `RoleAlreadyAssigned`, and revoking a role the account never
held fails with `RoleNotAssigned`.

### `has_role(account, role) -> bool`

Read-only check of one role assignment.

## Admin handover

An admin change is a two-step handover: the current admin proposes a
successor, and the successor accepts. Exactly one transfer may be in flight,
and it expires 86,400 seconds after it was proposed. Every attempt ends in
exactly one terminal state — `Accepted`, `Cancelled`, or `Expired` — and is
recorded in the admin-transfer history under a monotonic sequence number.

### `propose_admin_transfer(actor, proposed_admin)`

Requires `actor` authorization and the actor must be the current admin.

### `accept_admin_transfer(actor)`

Requires `actor` authorization and `actor` must be the proposed admin. Replaces
`Config.admin` and records the transfer as `Accepted`. A transfer that already
expired fails with `AdminTransferExpired` and stays pending so it can be
swept.

### `cancel_admin_transfer(actor)`

Requires `actor` authorization and the actor must be the current admin.
Records the transfer as `Cancelled`.

### `sweep_expired_admin_transfer() -> bool`

Permissionless. Records a lapsed transfer as `Expired` and returns whether an
expired transfer was found.

### `recover_admin(actor, new_admin)`

Requires `actor` authorization and the `Recovery` role. Restores admin control
when the admin key is lost: the current admin is replaced, the old admin's
roles move to the new admin (the old key keeps none, so a compromised key cannot
recover the seat back), and the takeover is recorded in the admin-transfer
history as `Accepted`.

## Scoped pause

A scope is an open-ended string (`Global`, `IssuerRegistry`, ...). Pausing a
scope appends a `PauseTransitionRecord` with a monotonic sequence number, an
optional commitment to the incident, and the ledger position of the change.
While the `Global` scope is paused, proposal creation and voting are rejected
with `ProtocolPaused`; finalizing and executing proposals stay open so an
incident cannot strand a ballot.

### `execute_pause(actor, scope, incident_commitment) -> u64`

Requires `actor` authorization and the `Pause` role. Returns the sequence
number of the history record.

### `execute_unpause(actor, scope) -> u64`

Requires `actor` authorization and the `Pause` role. Returns the sequence
number of the history record.

### `is_paused(scope) -> bool`

Read-only check of one scope.

## Protocol upgrades

An upgrade is proposed by a role holder and approved by role holders. Every
account counts once, and an upgrade that is not approved before it expires is
removed from the pending set.

### `propose_upgrade(actor, proposal_id, target_hash, version, ttl)`

Requires `actor` authorization and the `Upgrade` role. The upgrade is indexed
by its target hash so it can be found without the proposal id.

### `approve_upgrade(actor, proposal_id) -> u32`

Requires `actor` authorization and the `Upgrade` role. Returns the new
approval count. A second approval from the same account fails with
`UpgradeAlreadyApproved`.

### `sweep_expired_upgrades() -> u32`

Permissionless. Removes expired upgrades and returns how many were removed.

### `get_pending_upgrade(proposal_id)` / `get_pending_upgrade_by_hash(target_hash)`

Read-only lookups of a single pending upgrade.

## Bounded queries

History and pending-upgrade reads are bounded: `start_after` skips records up
to and including the given key, and `limit` caps the number of returned rows.
The default limit is 50 rows and the maximum is 200.

### `get_admin_transfer_history(start_after, limit)`

Admin-transfer records, oldest sequence first.

### `get_pause_history(scope, start_after, limit)`

Pause-transition records, oldest sequence first. `scope` restricts the result
to one scope.

### `get_pending_upgrades(start_after, limit)`

Pending upgrades that have not expired, ordered by proposal id.

## Errors

| Code | Name                      | Raised when                                                     |
| ---- | ------------------------- | --------------------------------------------------------------- |
| 1    | `AlreadyInitialized`      | `initialize` is called on an initialized contract               |
| 2    | `NotInitialized`          | Any call before `initialize`                                    |
| 3    | `InvalidInput`            | Empty title, zero voting period, or quorum above `10_000` bps   |
| 4    | `ProposalNotFound`        | Unknown `proposal_id`, or no vote from that voter on a proposal |
| 5    | `ProposalNotActive`       | Voting on a proposal whose status is no longer `Active`         |
| 6    | `VotingPeriodEnded`       | Voting after `voting_ends_at`                                   |
| 7    | `AlreadyVoted`            | The same address voting twice on one proposal                   |
| 8    | `NoVotingPower`           | The voter's governance-token balance is zero                    |
| 9    | `Overflow`                | Counter or tally arithmetic overflow                            |
| 10   | `InsufficientQuorum`      | Participation is below the configured execution threshold       |
| 11   | `ProposalExecutionFailed` | The proposal is not in `Passed` state                           |
| 12   | `CannotDelegateToSelf`    | An account tries to delegate to itself                          |
| 13   | `InvalidDelegation`       | A delegation would create a chain or cycle                      |
| 14   | `VotingPowerDelegated`    | A delegator tries to vote before revoking                       |
| 15   | `NoDelegation`            | An account tries to revoke when it has no delegation            |
| 16   | `Unauthorized`            | The account lacks the role the operation requires               |
| 17   | `RoleAlreadyAssigned`     | The account already holds the role                              |
| 18   | `RoleNotAssigned`         | The account does not hold the role that was to be revoked       |
| 19   | `AdminTransferNotFound`   | No admin transfer is pending                                    |
| 20   | `AdminTransferPending`    | An admin transfer is already pending                            |
| 21   | `AdminTransferExpired`    | The pending admin transfer expired                              |
| 22   | `UpgradeNotFound`         | The referenced pending upgrade does not exist                   |
| 23   | `UpgradeAlreadyApproved`  | The account already approved this pending upgrade               |
| 24   | `UpgradeExpired`          | The pending upgrade expired                                     |
| 25   | `ProtocolPaused`          | The operation is blocked by an active scoped pause              |
| 26   | `UpgradeAlreadyPending`   | A pending upgrade already exists for this proposal id           |

For the complete embedded ABI and a CLI-verified deployment procedure, see
[`docs/governance-contract.md`](../../docs/governance-contract.md).

## Development

```bash
cargo test -p cooplumen-governance   # unit tests (soroban-sdk testutils)
cargo fmt --check -p cooplumen-governance
```

The tests live in the `test` module of `src/lib.rs` and register a Stellar asset
contract as the governance token, so token-weighted tallies run against real
balances with mocked auth.
