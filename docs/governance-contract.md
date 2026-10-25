# Governance contract ABI and deployment

This guide documents the ABI implemented in
[`contracts/governance/src/lib.rs`](../contracts/governance/src/lib.rs) and a
repeatable Stellar CLI deployment flow. It was verified with Stellar CLI
27.1.0 against the contract's embedded specification.

## Build and inspect

From the repository root:

```bash
cargo test -p cooplumen-governance
stellar contract build --package cooplumen-governance --locked
stellar contract info interface \
  --wasm target/wasm32v1-none/release/cooplumen_governance.wasm
```

The build produces
`target/wasm32v1-none/release/cooplumen_governance.wasm`. The interface command
is the authoritative way to inspect the ABI embedded in a particular build.

## ABI

All integer types below are Soroban integers. Every function returns a Soroban
`Result<ok, GovernanceError>`.

| Function                       | Arguments                                                                                                    | Success value                    | Authorization and behavior                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initialize`                   | `admin: Address`, `governance_token: Address`, `voting_period: u64`, `quorum_bps: u32`, `total_supply: i128` | `()`                             | One-time configuration. Rejects a zero voting period, quorum above 10,000 basis points, or non-positive supply. It does not require address authorization. |
| `create_proposal`              | `proposer: Address`, `title: String`, `description: String`, `actions: Vec<String>`                          | `u64` proposal ID                | Requires `proposer` authorization. IDs start at 1. The title must be non-empty.                                                                            |
| `cast_vote`                    | `proposal_id: u64`, `choice: VoteChoice`, `voter: Address`                                                   | `()`                             | Requires `voter` authorization. Reads the voter's current governance-token balance and permits one vote per proposal.                                      |
| `finalize_proposal`            | `proposal_id: u64`                                                                                           | `ProposalStatus`                 | Permissionless after the voting window. `votes_for > votes_against` passes; a tie rejects.                                                                 |
| `execute_proposal`             | `proposal_id: u64`, `executor: Address`                                                                      | `()`                             | Requires `executor` authorization. The proposal must be passed and participation must meet quorum.                                                         |
| `get_config`                   | none                                                                                                         | `Config`                         | Read-only; returns the singleton configuration.                                                                                                            |
| `get_proposal`                 | `proposal_id: u64`                                                                                           | `Proposal`                       | Read-only proposal and live tally lookup.                                                                                                                  |
| `get_vote`                     | `proposal_id: u64`, `voter: Address`                                                                         | `Vote`                           | Read-only lookup for one recorded ballot.                                                                                                                  |
| `grant_role`                   | `actor: Address`, `account: Address`, `role: GovernanceRole`                                                 | `()`                             | Requires `actor` authorization. The admin or an `Upgrade` holder manages operational roles; only the admin grants `Upgrade` or `Recovery`.                 |
| `revoke_role`                  | `actor: Address`, `account: Address`, `role: GovernanceRole`                                                 | `()`                             | Requires `actor` authorization and the same authority as `grant_role`.                                                                                     |
| `has_role`                     | `account: Address`, `role: GovernanceRole`                                                                   | `bool`                           | Read-only role lookup.                                                                                                                                     |
| `propose_admin_transfer`       | `actor: Address`, `proposed_admin: Address`                                                                  | `()`                             | Requires `actor` authorization and the actor must be the current admin. Only one transfer may be in flight.                                                |
| `accept_admin_transfer`        | `actor: Address`                                                                                             | `()`                             | Requires `actor` authorization; `actor` must be the proposed admin. Replaces `Config.admin`.                                                               |
| `cancel_admin_transfer`        | `actor: Address`                                                                                             | `()`                             | Requires `actor` authorization and the actor must be the current admin.                                                                                    |
| `sweep_expired_admin_transfer` | none                                                                                                         | `bool`                           | Permissionless. Records a lapsed transfer as `Expired`.                                                                                                    |
| `recover_admin`                | `actor: Address`, `new_admin: Address`                                                                       | `()`                             | Requires `actor` authorization and the `Recovery` role. Restores admin control, moves the old admin's roles to the new admin, and records the takeover.    |
| `execute_pause`                | `actor: Address`, `scope: String`, `incident_commitment: Option<String>`                                     | `u64` sequence                   | Requires `actor` authorization and the `Pause` role. Records the transition in the pause history.                                                          |
| `execute_unpause`              | `actor: Address`, `scope: String`                                                                            | `u64` sequence                   | Requires `actor` authorization and the `Pause` role. Records the transition in the pause history.                                                          |
| `is_paused`                    | `scope: String`                                                                                              | `bool`                           | Read-only scope check.                                                                                                                                     |
| `propose_upgrade`              | `actor: Address`, `proposal_id: String`, `target_hash: String`, `version: String`, `ttl: u64`                | `()`                             | Requires `actor` authorization and the `Upgrade` role.                                                                                                     |
| `approve_upgrade`              | `actor: Address`, `proposal_id: String`                                                                      | `u32` approvals                  | Requires `actor` authorization and the `Upgrade` role. One approval per account.                                                                           |
| `sweep_expired_upgrades`       | none                                                                                                         | `u32` removed                    | Permissionless. Removes expired pending upgrades.                                                                                                          |
| `get_pending_upgrade`          | `proposal_id: String`                                                                                        | `Option<PendingUpgradeApproval>` | Read-only lookup by proposal id.                                                                                                                           |
| `get_pending_upgrade_by_hash`  | `target_hash: String`                                                                                        | `Option<PendingUpgradeApproval>` | Read-only lookup by target hash.                                                                                                                           |
| `get_admin_transfer_history`   | `start_after: Option<u64>`, `limit: Option<u32>`                                                             | `Vec<AdminTransferRecord>`       | Bounded history query, oldest sequence first.                                                                                                              |
| `get_pause_history`            | `scope: Option<String>`, `start_after: Option<u64>`, `limit: Option<u32>`                                    | `Vec<PauseTransitionRecord>`     | Bounded history query, optionally narrowed to one scope.                                                                                                   |
| `get_pending_upgrades`         | `start_after: Option<String>`, `limit: Option<u32>`                                                          | `Vec<PendingUpgradeApproval>`    | Bounded query over the pending upgrades that have not expired.                                                                                             |

### Contract types

```text
Config {
  admin: Address,
  governance_token: Address,
  voting_period: u64,
  quorum_bps: u32,
  total_supply: i128
}

Proposal {
  proposal_id: u64,
  proposer: Address,
  title: String,
  description: String,
  actions: Vec<String>,
  votes_for: i128,
  votes_against: i128,
  status: ProposalStatus,
  created_at: u64,
  voting_ends_at: u64
}

Vote { voter: Address, choice: VoteChoice, weight: i128 }
ProposalStatus = Active | Passed | Rejected | Executed
VoteChoice = For | Against
GovernanceRole = Pause | Schema | Issuer | Revocation | Upgrade | Recovery

AdminTransferRecord {
  sequence: u64,
  old_admin: Address,
  proposed_admin: Address,
  actor: Address,
  ledger_sequence: u32,
  timestamp: u64,
  terminal_reason: String
}

PauseTransitionRecord {
  sequence: u64,
  scope: String,
  is_paused: bool,
  actor: Address,
  ledger_sequence: u32,
  timestamp: u64,
  incident_commitment: Option<String>
}

PendingUpgradeApproval {
  proposal_id: String,
  target_hash: String,
  version: String,
  expires_at: u64,
  approval_count: u32
}

PendingAdminTransfer { proposed_admin: Address, expires_at: u64 }
```

`ledger_sequence` is the Soroban counterpart of a block height: Stellar ledgers
are sequenced rather than mined at a height. History records carry a monotonic
`sequence` of their own, so the order of transitions is provable from the
record alone. `terminal_reason` is `Accepted`, `Cancelled`, or `Expired`.

Bounded queries take a `start_after` key that skips every record up to and
including that key, and a `limit` that caps the number of returned rows. The
default limit is 50 rows and the maximum is 200.

`total_supply` is supplied at initialization because the standard Soroban
token interface has no total-supply method. Quorum is calculated at execution
as `total_supply * quorum_bps / 10_000`; the configured denominator does not
automatically change when tokens are minted or burned.

### Errors

| Code | Name                      | Meaning                                                             |
| ---- | ------------------------- | ------------------------------------------------------------------- |
| 1    | `AlreadyInitialized`      | Configuration already exists.                                       |
| 2    | `NotInitialized`          | Configuration is required for the requested operation.              |
| 3    | `InvalidInput`            | Initialization values or proposal title are invalid.                |
| 4    | `ProposalNotFound`        | The proposal or requested vote does not exist.                      |
| 5    | `ProposalNotActive`       | The proposal can no longer accept votes or be finalized.            |
| 6    | `VotingPeriodEnded`       | Voting has closed, or finalization was attempted before it closed.  |
| 7    | `AlreadyVoted`            | The address already voted on this proposal.                         |
| 8    | `NoVotingPower`           | The voter's current token balance is not positive.                  |
| 9    | `Overflow`                | Checked counter, timestamp, tally, or quorum arithmetic overflowed. |
| 10   | `InsufficientQuorum`      | Participation is below the configured threshold.                    |
| 11   | `ProposalExecutionFailed` | The proposal is not in `Passed` state.                              |
| 12   | `CannotDelegateToSelf`    | An account tries to delegate to itself.                             |
| 13   | `InvalidDelegation`       | A delegation would create a chain or cycle.                         |
| 14   | `VotingPowerDelegated`    | A delegator tries to vote before revoking.                          |
| 15   | `NoDelegation`            | An account tries to revoke when it has no delegation.               |
| 16   | `Unauthorized`            | The account lacks the governance role the operation requires.       |
| 17   | `RoleAlreadyAssigned`     | The account already holds the role.                                 |
| 18   | `RoleNotAssigned`         | The account does not hold the role that was to be revoked.          |
| 19   | `AdminTransferNotFound`   | No admin transfer is pending.                                       |
| 20   | `AdminTransferPending`    | An admin transfer is already pending.                               |
| 21   | `AdminTransferExpired`    | The pending admin transfer expired.                                 |
| 22   | `UpgradeNotFound`         | The referenced pending upgrade does not exist.                      |
| 23   | `UpgradeAlreadyApproved`  | The account already approved this pending upgrade.                  |
| 24   | `UpgradeExpired`          | The pending upgrade expired.                                        |
| 25   | `ProtocolPaused`          | The operation is blocked by an active scoped pause.                 |
| 26   | `UpgradeAlreadyPending`   | A pending upgrade already exists for this proposal id.              |

### Execution events

`execute_proposal` marks the proposal `Executed` and publishes one event for
each action string:

| Topic                        | Data                    | Condition             |
| ---------------------------- | ----------------------- | --------------------- |
| `("prop_exec", proposal_id)` | non-empty action string | Normal action record  |
| `("exec_fail", proposal_id)` | empty action string     | Invalid action record |

The current implementation does not parse actions or make cross-contract
calls. An indexer or executor service must consume these events and perform
the encoded work. An empty action does not revert execution.

### Governance operations events

| Topic              | Data                                                                  | Condition                                  |
| ------------------ | --------------------------------------------------------------------- | ------------------------------------------ |
| `("role_granted")` | `actor`, `account`, `role`                                            | A role was granted                         |
| `("role_revoked")` | `actor`, `account`, `role`                                            | A role was revoked                         |
| `("admin_xfer")`   | `sequence`, `old_admin`, `proposed_admin`, `actor`, `terminal_reason` | An admin transfer reached a terminal state |
| `("pause")`        | `sequence`, `scope`, `is_paused`, `actor`                             | A scope was paused or resumed              |
| `("upg_proposed")` | `actor`, `proposal_id`, `target_hash`, `version`                      | An upgrade was proposed                    |
| `("upg_approved")` | `approver`, `proposal_id`, `approval_count`                           | A role holder approved an upgrade          |
| `("upg_expired")`  | `proposal_id`                                                         | An expired upgrade was removed             |

## Deploy to testnet

The examples use a named CLI identity and the built-in `testnet` network. Do
not put secret keys in source control or command history.

1. Create and fund a deployment identity if one is not already configured:

   ```bash
   stellar keys generate cooplumen-deployer --network testnet --fund
   stellar keys address cooplumen-deployer
   ```

2. Build the release WASM and run its tests:

   ```bash
   cargo test -p cooplumen-governance
   stellar contract build --package cooplumen-governance --locked
   ```

3. Deploy and save the returned contract ID under a local alias:

   ```bash
   stellar contract deploy \
     --wasm target/wasm32v1-none/release/cooplumen_governance.wasm \
     --source cooplumen-deployer \
     --network testnet \
     --alias cooplumen-governance
   ```

4. Initialize immediately. `TOKEN_CONTRACT_ID` must identify a deployed token
   contract implementing the standard `balance(Address) -> i128` interface.
   Token amounts use the token contract's smallest unit.

   ```bash
   export ADMIN_ADDRESS="$(stellar keys address cooplumen-deployer)"
   export TOKEN_CONTRACT_ID="C..."

   stellar contract invoke \
     --id cooplumen-governance \
     --source cooplumen-deployer \
     --network testnet \
     -- initialize \
     --admin "$ADMIN_ADDRESS" \
     --governance_token "$TOKEN_CONTRACT_ID" \
     --voting_period 86400 \
     --quorum_bps 5000 \
     --total_supply 1000000000
   ```

   Initialization is a first-writer operation and currently has no
   `require_auth` guard. Deploy and initialize in one controlled run; do not
   leave an uninitialized contract ID exposed.

5. Verify the stored configuration without submitting a transaction:

   ```bash
   stellar contract invoke \
     --id cooplumen-governance \
     --source cooplumen-deployer \
     --network testnet \
     --send no \
     -- get_config
   ```

For mainnet, configure a mainnet identity and replace every `--network
testnet` argument with the reviewed mainnet network alias. Rebuild from the
audited commit, record the WASM hash printed by `stellar contract build`, and
verify the deployed contract ID and initialization result before publishing it
to backend or frontend configuration.

## Example lifecycle

The Stellar CLI derives argument parsing from the embedded ABI. Addresses that
authorize `create_proposal`, `cast_vote`, or `execute_proposal` must be
available to the CLI source/signing configuration.

```bash
stellar contract invoke --id cooplumen-governance --source alice --network testnet -- \
  create_proposal \
  --proposer "$(stellar keys address alice)" \
  --title "Fund the community garden" \
  --description "Release the approved grant" \
  --actions '["treasury:release:grant-42"]'

stellar contract invoke --id cooplumen-governance --source bob --network testnet -- \
  cast_vote \
  --proposal_id 1 \
  --choice For \
  --voter "$(stellar keys address bob)"

# Run only after voting_ends_at.
stellar contract invoke --id cooplumen-governance --source cooplumen-deployer --network testnet -- \
  finalize_proposal --proposal_id 1

stellar contract invoke --id cooplumen-governance --source cooplumen-deployer --network testnet -- \
  execute_proposal \
  --proposal_id 1 \
  --executor "$(stellar keys address cooplumen-deployer)"
```

Before using an example against a deployed contract, run
`stellar contract invoke ... -- --help` to confirm the argument rendering for
the installed CLI version and deployed ABI.
