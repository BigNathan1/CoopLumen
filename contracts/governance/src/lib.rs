#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, symbol_short, token,
    Address, Env, Map, String, Symbol, Vec,
};

/// Errors returned by the CoopLumen Governance contract.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum GovernanceError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidInput = 3,
    ProposalNotFound = 4,
    ProposalNotActive = 5,
    VotingPeriodEnded = 6,
    AlreadyVoted = 7,
    NoVotingPower = 8,
    Overflow = 9,
    /// The proposal did not reach the minimum quorum threshold.
    InsufficientQuorum = 10,
    /// The proposal is not in `Passed` status and cannot be executed.
    ProposalExecutionFailed = 11,
    /// An account cannot delegate voting power to itself.
    CannotDelegateToSelf = 12,
    /// Delegation is limited to one hop to prevent cycles and ambiguous power.
    InvalidDelegation = 13,
    /// The voter delegated their power and must revoke before voting directly.
    VotingPowerDelegated = 14,
    /// The account has no active delegation to revoke.
    NoDelegation = 15,
    /// The account does not hold the governance role the operation requires.
    Unauthorized = 16,
    /// The account already holds the governance role.
    RoleAlreadyAssigned = 17,
    /// The account does not hold the governance role that was to be revoked.
    RoleNotAssigned = 18,
    /// No admin transfer is pending.
    AdminTransferNotFound = 19,
    /// An admin transfer is already pending.
    AdminTransferPending = 20,
    /// The pending admin transfer expired before it was accepted.
    AdminTransferExpired = 21,
    /// The referenced pending upgrade does not exist.
    UpgradeNotFound = 22,
    /// The account already approved this pending upgrade.
    UpgradeAlreadyApproved = 23,
    /// The pending upgrade expired before it was approved.
    UpgradeExpired = 24,
    /// The operation is blocked by an active scoped pause.
    ProtocolPaused = 25,
    /// A pending upgrade already exists for this proposal id.
    UpgradeAlreadyPending = 26,
}

/// Lifecycle status of an on-chain proposal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    Active,
    Passed,
    Rejected,
    Executed,
}

/// Choice made by a voter when casting a vote.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VoteChoice {
    For,
    Against,
}

/// Governance contract configuration.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub governance_token: Address,
    pub voting_period: u64,
    pub quorum_bps: u32,
    /// Total supply of the governance token, used as the quorum denominator.
    /// The standard token interface has no `total_supply` accessor, so this
    /// is supplied at initialization time and trusted from there.
    pub total_supply: i128,
}

/// On-chain proposal record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub proposal_id: u64,
    pub proposer: Address,
    pub title: String,
    pub description: String,
    pub actions: Vec<String>,
    pub votes_for: i128,
    pub votes_against: i128,
    pub status: ProposalStatus,
    pub created_at: u64,
    pub voting_ends_at: u64,
}

/// Individual vote record cast by an account.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Vote {
    pub voter: Address,
    pub choice: VoteChoice,
    pub weight: i128,
}

/// Aggregate governance metrics derived from on-chain proposal tallies.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceAnalytics {
    pub total_proposals: u64,
    pub active_proposals: u64,
    pub finalized_proposals: u64,
    pub passed_proposals: u64,
    pub rejected_proposals: u64,
    pub executed_proposals: u64,
    pub total_voting_power_cast: i128,
    /// Average participation across every proposal, in basis points.
    pub voter_turnout_bps: u32,
    /// Average participation across finalized proposals, in basis points.
    pub average_quorum_bps: u32,
    /// Passed and executed proposals divided by finalized proposals, in basis points.
    pub proposal_pass_rate_bps: u32,
}

/// Operation-scoped governance roles.
///
/// A role gates exactly one family of protocol operations, so an account can
/// hold the authority it needs without becoming a full administrator. Roles are
/// assigned by the contract admin or by an account holding the `Upgrade` role
/// and are always checked through the same centralized guard.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GovernanceRole {
    /// Pause and resume scoped protocol operations.
    Pause,
    /// Change schema-affecting protocol configuration.
    Schema,
    /// Register and update issuers.
    Issuer,
    /// Revoke issued credentials.
    Revocation,
    /// Propose and approve protocol upgrades.
    Upgrade,
    /// Restore admin control when the admin key is lost.
    Recovery,
}

/// Audit record of a terminal admin-transfer transition.
///
/// Every admin transfer ends in exactly one terminal state, so the history
/// holds one record per attempt and `terminal_reason` states which one:
/// `Accepted`, `Cancelled`, or `Expired`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminTransferRecord {
    /// Monotonic sequence number of the record.
    pub sequence: u64,
    /// The admin in control before the transition.
    pub old_admin: Address,
    /// The account that was proposed to take over.
    pub proposed_admin: Address,
    /// The account that performed the terminal transition. For an expiry this
    /// is the outgoing admin whose transfer lapsed.
    pub actor: Address,
    /// Ledger sequence the transition was recorded in.
    pub ledger_sequence: u32,
    /// Ledger timestamp of the transition.
    pub timestamp: u64,
    /// Why the transfer ended: `Accepted`, `Cancelled`, or `Expired`.
    pub terminal_reason: String,
}

/// Audit record of a scoped pause state transition.
///
/// Scopes are open-ended strings (`Global`, `IssuerRegistry`, ...). The
/// sequence numbers are monotonic, so the order of incident responses can be
/// proven from the history alone.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PauseTransitionRecord {
    /// Monotonic sequence number of the record.
    pub sequence: u64,
    /// The scope whose state changed.
    pub scope: String,
    /// Whether the scope is paused after the transition.
    pub is_paused: bool,
    /// The account that performed the transition.
    pub actor: Address,
    /// Ledger sequence the transition was recorded in.
    pub ledger_sequence: u32,
    /// Ledger timestamp of the transition.
    pub timestamp: u64,
    /// Optional commitment to the incident that triggered the pause.
    pub incident_commitment: Option<String>,
}

/// A protocol upgrade that role holders still have to approve.
///
/// The record is removed once it expires or is superseded, and the upgrade
/// hash index makes it possible to find a pending upgrade by its target hash.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingUpgradeApproval {
    /// Identifier of the upgrade proposal.
    pub proposal_id: String,
    /// Hash of the build the upgrade points at.
    pub target_hash: String,
    /// Version label of the build.
    pub version: String,
    /// Ledger timestamp after which the upgrade can no longer be approved.
    pub expires_at: u64,
    /// Number of distinct accounts that approved the upgrade.
    pub approval_count: u32,
}

/// The admin transfer that is currently awaiting acceptance.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingAdminTransfer {
    /// The account proposed to take over as admin.
    pub proposed_admin: Address,
    /// Ledger timestamp after which the transfer can no longer be accepted.
    pub expires_at: u64,
}

/// Contract storage keys.
#[contracttype]
pub enum DataKey {
    Config,
    Proposal(u64),
    Vote(u64, Address),
    VoteUsed(u64, Address),
    Delegation(Address),
    Delegators(Address),
    ProposalCount,
    /// Role assignment of one account, addressed by account and role.
    GovernanceRole(Address, GovernanceRole),
    /// Monotonic sequence of the admin-transfer history.
    AdminHistorySeq,
    /// Admin-transfer history, addressed by its monotonic sequence.
    AdminTransferHistory,
    /// The admin transfer that is awaiting acceptance.
    PendingAdminTransfer,
    /// Monotonic sequence of the pause-transition history.
    PauseHistorySeq,
    /// Pause-transition history, addressed by its monotonic sequence.
    PauseHistory,
    /// Whether one scope is currently paused.
    PauseScope(String),
    /// Pending upgrades, addressed by proposal id.
    PendingUpgrades,
    /// Index from an upgrade target hash to its proposal id.
    PendingUpgradeHashes,
    /// The accounts that approved one pending upgrade.
    UpgradeApprovals(String),
}

// Event topic symbols

/// Emitted when a proposal is successfully executed.
/// `topics = ("proposal_executed", proposal_id)`
/// `data   = actions: Vec<String>`
const TOPIC_PROPOSAL_EXECUTED: Symbol = symbol_short!("prop_exec");

/// Emitted for each action that could not be dispatched during execution.
/// `topics = ("execution_failed", proposal_id)`
/// `data   = action: String`
const TOPIC_EXECUTION_FAILED: Symbol = symbol_short!("exec_fail");

/// Emitted when an account delegates its voting power.
#[contractevent(topics = ["delegated"])]
pub struct VotingPowerDelegatedEvent {
    #[topic]
    pub delegator: Address,
    pub delegatee: Address,
}

/// Emitted when an account revokes its voting-power delegation.
#[contractevent(topics = ["undel"])]
pub struct VotingPowerUndelegatedEvent {
    #[topic]
    pub delegator: Address,
    #[topic]
    pub former_delegatee: Address,
}

/// Scope that pauses the whole protocol.
const GLOBAL_SCOPE: &str = "Global";

/// Lifetime of a pending admin transfer, in seconds.
const ADMIN_TRANSFER_TTL: u64 = 86_400;

/// Terminal reason of an admin transfer that was accepted.
const REASON_ACCEPTED: &str = "Accepted";

/// Terminal reason of an admin transfer the admin withdrew.
const REASON_CANCELLED: &str = "Cancelled";

/// Terminal reason of an admin transfer that lapsed.
const REASON_EXPIRED: &str = "Expired";

/// Number of rows a bounded query returns when no limit is given.
const DEFAULT_QUERY_LIMIT: u32 = 50;

/// Largest number of rows a bounded query returns.
const MAX_QUERY_LIMIT: u32 = 200;

/// Emitted when an account is granted an operation-scoped governance role.
#[contractevent(topics = ["role_granted"])]
pub struct RoleGrantedEvent {
    #[topic]
    pub actor: Address,
    #[topic]
    pub account: Address,
    pub role: GovernanceRole,
}

/// Emitted when an account loses an operation-scoped governance role.
#[contractevent(topics = ["role_revoked"])]
pub struct RoleRevokedEvent {
    #[topic]
    pub actor: Address,
    #[topic]
    pub account: Address,
    pub role: GovernanceRole,
}

/// Emitted when an admin transfer reaches a terminal state.
#[contractevent(topics = ["admin_xfer"])]
pub struct AdminTransferEvent {
    #[topic]
    pub sequence: u64,
    pub old_admin: Address,
    pub proposed_admin: Address,
    pub actor: Address,
    pub terminal_reason: String,
}

/// Emitted when a scope is paused or resumed.
#[contractevent(topics = ["pause"])]
pub struct PauseTransitionEvent {
    #[topic]
    pub sequence: u64,
    pub scope: String,
    pub is_paused: bool,
    pub actor: Address,
}

/// Emitted when a protocol upgrade is proposed.
#[contractevent(topics = ["upg_proposed"])]
pub struct UpgradeProposedEvent {
    #[topic]
    pub actor: Address,
    pub proposal_id: String,
    pub target_hash: String,
    pub version: String,
}

/// Emitted when a role holder approves a pending upgrade.
#[contractevent(topics = ["upg_approved"])]
pub struct UpgradeApprovedEvent {
    #[topic]
    pub approver: Address,
    pub proposal_id: String,
    pub approval_count: u32,
}

/// Emitted when a pending upgrade is removed after it expired.
#[contractevent(topics = ["upg_expired"])]
pub struct UpgradeExpiredEvent {
    #[topic]
    pub proposal_id: String,
}

/// On-chain Governance smart contract for CoopLumen.
#[contract]
pub struct GovernanceContract;

#[contractimpl]
impl GovernanceContract {
    /// Initialize the governance contract with admin, governance token, voting period, and quorum.
    pub fn initialize(
        env: Env,
        admin: Address,
        governance_token: Address,
        voting_period: u64,
        quorum_bps: u32,
        total_supply: i128,
    ) -> Result<(), GovernanceError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(GovernanceError::AlreadyInitialized);
        }
        if voting_period == 0 || quorum_bps > 10_000 || total_supply <= 0 {
            return Err(GovernanceError::InvalidInput);
        }

        let config = Config {
            admin: admin.clone(),
            governance_token,
            voting_period,
            quorum_bps,
            total_supply,
        };
        env.storage().instance().set(&DataKey::Config, &config);

        // The admin starts with every operation-scoped role so the contract is
        // operable from the first block, and roles can be handed out later
        // without a separate bootstrap step.
        for role in all_roles(&env) {
            env.storage()
                .instance()
                .set(&DataKey::GovernanceRole(admin.clone(), role), &true);
        }

        Ok(())
    }

    /// Create a new proposal with title, description, and list of actions.
    pub fn create_proposal(
        env: Env,
        proposer: Address,
        title: String,
        description: String,
        actions: Vec<String>,
    ) -> Result<u64, GovernanceError> {
        proposer.require_auth();

        let config: Config = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(GovernanceError::NotInitialized)?;

        assert_not_paused(&env, GLOBAL_SCOPE)?;

        if title.is_empty() {
            return Err(GovernanceError::InvalidInput);
        }

        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ProposalCount)
            .unwrap_or(0);
        let proposal_id = count.checked_add(1).ok_or(GovernanceError::Overflow)?;

        let now = env.ledger().timestamp();
        let voting_ends_at = now
            .checked_add(config.voting_period)
            .ok_or(GovernanceError::Overflow)?;

        let proposal = Proposal {
            proposal_id,
            proposer,
            title,
            description,
            actions,
            votes_for: 0,
            votes_against: 0,
            status: ProposalStatus::Active,
            created_at: now,
            voting_ends_at,
        };

        env.storage()
            .instance()
            .set(&DataKey::Proposal(proposal_id), &proposal);
        env.storage()
            .instance()
            .set(&DataKey::ProposalCount, &proposal_id);

        Ok(proposal_id)
    }

    /// Delegate all current governance-token voting power to another account.
    ///
    /// Delegation is intentionally one hop: an account that already represents
    /// delegators cannot delegate onward, and a delegatee cannot itself have an
    /// active delegation. This keeps vote accounting deterministic and prevents
    /// cycles. The token balance is read when a vote is cast, not when the
    /// delegation is created.
    pub fn delegate(
        env: Env,
        delegator: Address,
        delegatee: Address,
    ) -> Result<(), GovernanceError> {
        delegator.require_auth();

        let config: Config = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(GovernanceError::NotInitialized)?;

        if delegator == delegatee {
            return Err(GovernanceError::CannotDelegateToSelf);
        }

        let token_client = token::Client::new(&env, &config.governance_token);
        if token_client.balance(&delegator) <= 0 {
            return Err(GovernanceError::NoVotingPower);
        }

        let inbound: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Delegators(delegator.clone()))
            .unwrap_or(Vec::new(&env));
        let delegatee_outbound: Option<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Delegation(delegatee.clone()));

        if !inbound.is_empty() || delegatee_outbound.is_some() {
            return Err(GovernanceError::InvalidDelegation);
        }

        let previous: Option<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Delegation(delegator.clone()));
        if previous == Some(delegatee.clone()) {
            return Ok(());
        }

        if let Some(previous_delegatee) = previous {
            remove_delegator(&env, &previous_delegatee, &delegator);
        }

        let mut delegators: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Delegators(delegatee.clone()))
            .unwrap_or(Vec::new(&env));
        delegators.push_back(delegator.clone());

        env.storage()
            .instance()
            .set(&DataKey::Delegation(delegator.clone()), &delegatee);
        env.storage()
            .instance()
            .set(&DataKey::Delegators(delegatee.clone()), &delegators);
        VotingPowerDelegatedEvent {
            delegator,
            delegatee,
        }
        .publish(&env);

        Ok(())
    }

    /// Revoke the caller's active voting-power delegation.
    pub fn undelegate(env: Env, delegator: Address) -> Result<(), GovernanceError> {
        delegator.require_auth();

        if !env.storage().instance().has(&DataKey::Config) {
            return Err(GovernanceError::NotInitialized);
        }

        let delegatee: Address = env
            .storage()
            .instance()
            .get(&DataKey::Delegation(delegator.clone()))
            .ok_or(GovernanceError::NoDelegation)?;

        remove_delegator(&env, &delegatee, &delegator);
        env.storage()
            .instance()
            .remove(&DataKey::Delegation(delegator.clone()));
        VotingPowerUndelegatedEvent {
            delegator,
            former_delegatee: delegatee,
        }
        .publish(&env);

        Ok(())
    }

    /// Cast a token-weighted vote on an active proposal.
    pub fn cast_vote(
        env: Env,
        proposal_id: u64,
        choice: VoteChoice,
        voter: Address,
    ) -> Result<(), GovernanceError> {
        voter.require_auth();

        let config: Config = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(GovernanceError::NotInitialized)?;

        assert_not_paused(&env, GLOBAL_SCOPE)?;

        if env
            .storage()
            .instance()
            .has(&DataKey::Delegation(voter.clone()))
        {
            return Err(GovernanceError::VotingPowerDelegated);
        }

        let mut proposal: Proposal = env
            .storage()
            .instance()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(GovernanceError::ProposalNotFound)?;

        if proposal.status != ProposalStatus::Active {
            return Err(GovernanceError::ProposalNotActive);
        }

        if env.ledger().timestamp() > proposal.voting_ends_at {
            return Err(GovernanceError::VotingPeriodEnded);
        }

        let token_client = token::Client::new(&env, &config.governance_token);
        let mut represented = Vec::new(&env);
        represented.push_back(voter.clone());

        let delegators: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Delegators(voter.clone()))
            .unwrap_or(Vec::new(&env));
        for delegator in delegators.iter() {
            represented.push_back(delegator);
        }

        let mut weight = 0_i128;
        for account in represented.iter() {
            if env
                .storage()
                .instance()
                .has(&DataKey::VoteUsed(proposal_id, account.clone()))
                || env
                    .storage()
                    .instance()
                    .has(&DataKey::Vote(proposal_id, account.clone()))
            {
                return Err(GovernanceError::AlreadyVoted);
            }

            weight = weight
                .checked_add(token_client.balance(&account))
                .ok_or(GovernanceError::Overflow)?;
        }

        if weight <= 0 {
            return Err(GovernanceError::NoVotingPower);
        }

        match choice {
            VoteChoice::For => {
                proposal.votes_for = proposal
                    .votes_for
                    .checked_add(weight)
                    .ok_or(GovernanceError::Overflow)?;
            }
            VoteChoice::Against => {
                proposal.votes_against = proposal
                    .votes_against
                    .checked_add(weight)
                    .ok_or(GovernanceError::Overflow)?;
            }
        }

        let vote_record = Vote {
            voter: voter.clone(),
            choice,
            weight,
        };

        env.storage()
            .instance()
            .set(&DataKey::Vote(proposal_id, voter.clone()), &vote_record);
        for account in represented.iter() {
            env.storage()
                .instance()
                .set(&DataKey::VoteUsed(proposal_id, account), &true);
        }
        env.storage()
            .instance()
            .set(&DataKey::Proposal(proposal_id), &proposal);

        Ok(())
    }

    /// Finalise a proposal whose voting period has elapsed.
    ///
    /// Transitions the status from `Active` to `Passed` (votes_for > votes_against)
    /// or `Rejected`. Anyone may call this once the voting window has closed; it is
    /// a prerequisite for `execute_proposal`.
    ///
    /// Returns `VotingPeriodEnded` if the window is still open, and
    /// `ProposalNotActive` if the proposal is already finalised.
    pub fn finalize_proposal(
        env: Env,
        proposal_id: u64,
    ) -> Result<ProposalStatus, GovernanceError> {
        let mut proposal: Proposal = env
            .storage()
            .instance()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(GovernanceError::ProposalNotFound)?;

        if proposal.status != ProposalStatus::Active {
            return Err(GovernanceError::ProposalNotActive);
        }

        // The voting window must have closed before we can finalise.
        if env.ledger().timestamp() <= proposal.voting_ends_at {
            return Err(GovernanceError::VotingPeriodEnded);
        }

        proposal.status = if proposal.votes_for > proposal.votes_against {
            ProposalStatus::Passed
        } else {
            ProposalStatus::Rejected
        };

        env.storage()
            .instance()
            .set(&DataKey::Proposal(proposal_id), &proposal);

        Ok(proposal.status)
    }

    /// Execute a passed proposal, dispatching its encoded actions on-chain.
    ///
    /// # Prerequisites
    ///
    /// 1. The contract must be initialised.
    /// 2. The proposal must exist and be in `Passed` status (call
    ///    [`finalize_proposal`] after the voting window closes to transition it).
    /// 3. Total participation (votes_for + votes_against) must meet or exceed
    ///    `quorum_bps / 10_000` of the governance-token total supply.
    ///
    /// # Execution model
    ///
    /// Actions are opaque `String` values stored on the proposal (e.g.
    /// `"disburse_treasury:500"`). The contract emits a
    /// `TOPIC_PROPOSAL_EXECUTED` event carrying all action strings once the
    /// entire batch succeeds.  If the quorum check fails the function returns
    /// `InsufficientQuorum`; if the proposal is not in `Passed` status it
    /// returns `ProposalExecutionFailed`.  Individual action failures are
    /// recorded via `TOPIC_EXECUTION_FAILED` events but do not revert the
    /// status transition — the proposal is marked `Executed` regardless, so
    /// off-chain indexers can detect partial failures without allowing
    /// re-execution.
    ///
    /// # Authorization
    ///
    /// The `executor` address must authorise the call (`require_auth`). Any
    /// address may execute a passed, quorate proposal — the contract does not
    /// restrict execution to the admin or proposer.
    #[allow(deprecated)]
    pub fn execute_proposal(
        env: Env,
        proposal_id: u64,
        executor: Address,
    ) -> Result<(), GovernanceError> {
        executor.require_auth();

        let config: Config = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(GovernanceError::NotInitialized)?;

        let mut proposal: Proposal = env
            .storage()
            .instance()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(GovernanceError::ProposalNotFound)?;

        // 1. Status gate
        // Only a Passed proposal may be executed; Executed proposals are idempotent-blocked.
        if proposal.status != ProposalStatus::Passed {
            return Err(GovernanceError::ProposalExecutionFailed);
        }

        // 2. Quorum check
        // participation = votes_for + votes_against
        // required      = total_supply * quorum_bps / 10_000
        //
        // total_supply comes from Config (the standard token interface has no
        // total_supply accessor, so it is supplied at initialization time).
        // We use i128 arithmetic throughout and guard every step with
        // checked_* to satisfy the `overflow-checks = true` release profile.
        let total_supply = config.total_supply;

        let participation = proposal
            .votes_for
            .checked_add(proposal.votes_against)
            .ok_or(GovernanceError::Overflow)?;

        // required_participation = total_supply * quorum_bps / 10_000
        // Cast quorum_bps to i128 for the multiplication.
        let quorum_bps_i128 = i128::from(config.quorum_bps);
        let required = total_supply
            .checked_mul(quorum_bps_i128)
            .ok_or(GovernanceError::Overflow)?
            / 10_000_i128;

        if participation < required {
            return Err(GovernanceError::InsufficientQuorum);
        }

        // 3. Status transition
        // Mark Executed before dispatching actions so re-entrant calls are
        // blocked even if an action somehow calls back into this contract.
        proposal.status = ProposalStatus::Executed;
        env.storage()
            .instance()
            .set(&DataKey::Proposal(proposal_id), &proposal);

        // 4. Action dispatch
        // Actions are opaque encoded strings (e.g. "disburse_treasury:500").
        // The contract records each one in an event so off-chain indexers and
        // executor bots can pick them up and drive the corresponding sub-calls.
        // Failures are surfaced as individual TOPIC_EXECUTION_FAILED events;
        // they do not revert the Executed status (preventing indefinite retry
        // loops on a permanently-failing action).
        #[allow(deprecated)]
        for action in proposal.actions.iter() {
            // Validate the action string is non-empty before recording it.
            if action.is_empty() {
                #[allow(deprecated)]
                env.events()
                    .publish((TOPIC_EXECUTION_FAILED, proposal_id), action.clone());
                continue;
            }

            // Emit the action for off-chain executors / indexers.
            // In a production contract this is where cross-contract calls or
            // sub-invocations keyed on the action prefix would be dispatched.
            #[allow(deprecated)]
            env.events()
                .publish((TOPIC_PROPOSAL_EXECUTED, proposal_id), action.clone());
        }

        Ok(())
    }

    /// Get current governance configuration.
    pub fn get_config(env: Env) -> Result<Config, GovernanceError> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(GovernanceError::NotInitialized)
    }

    /// Calculate aggregate governance metrics from the current on-chain state.
    ///
    /// Turnout includes active proposals so dashboards can reflect live
    /// participation. Average quorum and pass rate include only finalized
    /// proposals (`Passed`, `Rejected`, or `Executed`) so open ballots do not
    /// distort outcome metrics. `Executed` is counted as a passed outcome.
    pub fn get_analytics(env: Env) -> Result<GovernanceAnalytics, GovernanceError> {
        let config: Config = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(GovernanceError::NotInitialized)?;
        let total_proposals: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ProposalCount)
            .unwrap_or(0);

        let mut active_proposals = 0_u64;
        let mut finalized_proposals = 0_u64;
        let mut passed_proposals = 0_u64;
        let mut rejected_proposals = 0_u64;
        let mut executed_proposals = 0_u64;
        let mut total_voting_power_cast = 0_i128;
        let mut turnout_bps_total = 0_u64;
        let mut finalized_quorum_bps_total = 0_u64;

        let mut proposal_id = 1_u64;
        while proposal_id <= total_proposals {
            let proposal: Proposal = env
                .storage()
                .instance()
                .get(&DataKey::Proposal(proposal_id))
                .ok_or(GovernanceError::ProposalNotFound)?;
            let participation = proposal
                .votes_for
                .checked_add(proposal.votes_against)
                .ok_or(GovernanceError::Overflow)?;
            total_voting_power_cast = total_voting_power_cast
                .checked_add(participation)
                .ok_or(GovernanceError::Overflow)?;

            let participation_bps = participation_basis_points(participation, config.total_supply)?;
            turnout_bps_total = turnout_bps_total
                .checked_add(u64::from(participation_bps))
                .ok_or(GovernanceError::Overflow)?;

            match proposal.status {
                ProposalStatus::Active => active_proposals += 1,
                ProposalStatus::Passed => {
                    finalized_proposals += 1;
                    passed_proposals += 1;
                    finalized_quorum_bps_total += u64::from(participation_bps);
                }
                ProposalStatus::Rejected => {
                    finalized_proposals += 1;
                    rejected_proposals += 1;
                    finalized_quorum_bps_total += u64::from(participation_bps);
                }
                ProposalStatus::Executed => {
                    finalized_proposals += 1;
                    passed_proposals += 1;
                    executed_proposals += 1;
                    finalized_quorum_bps_total += u64::from(participation_bps);
                }
            }

            proposal_id = proposal_id
                .checked_add(1)
                .ok_or(GovernanceError::Overflow)?;
        }

        let voter_turnout_bps = turnout_bps_total.checked_div(total_proposals).unwrap_or(0) as u32;
        let average_quorum_bps = finalized_quorum_bps_total
            .checked_div(finalized_proposals)
            .unwrap_or(0) as u32;
        let proposal_pass_rate_bps = if finalized_proposals == 0 {
            0
        } else {
            passed_proposals
                .checked_mul(10_000)
                .ok_or(GovernanceError::Overflow)?
                .checked_div(finalized_proposals)
                .ok_or(GovernanceError::Overflow)? as u32
        };

        Ok(GovernanceAnalytics {
            total_proposals,
            active_proposals,
            finalized_proposals,
            passed_proposals,
            rejected_proposals,
            executed_proposals,
            total_voting_power_cast,
            voter_turnout_bps,
            average_quorum_bps,
            proposal_pass_rate_bps,
        })
    }

    /// Read a proposal by ID.
    ///
    /// This is the read side of the governance contract. It returns the stored
    /// [`Proposal`] for `proposal_id` — the proposer and metadata, the encoded
    /// `actions` the proposal would execute, the running `votes_for` /
    /// `votes_against` tallies, the lifecycle `status`, and the voting window
    /// (`created_at` / `voting_ends_at`) — without mutating any state, so it is
    /// safe to call from a read-only / simulation invocation.
    ///
    /// Because every proposal is keyed by its own `proposal_id`, a call for one
    /// id can never observe or disturb another proposal's record.
    ///
    /// # Errors
    ///
    /// - [`GovernanceError::NotInitialized`] if the contract has not been
    ///   initialized yet, matching `get_config`, `create_proposal` and
    ///   `cast_vote`.
    /// - [`GovernanceError::ProposalNotFound`] if the contract is initialized
    ///   but no proposal is stored under `proposal_id`.
    pub fn get_proposal(env: Env, proposal_id: u64) -> Result<Proposal, GovernanceError> {
        if !env.storage().instance().has(&DataKey::Config) {
            return Err(GovernanceError::NotInitialized);
        }

        env.storage()
            .instance()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(GovernanceError::ProposalNotFound)
    }

    /// Read a vote cast by a voter for a proposal.
    pub fn get_vote(env: Env, proposal_id: u64, voter: Address) -> Result<Vote, GovernanceError> {
        env.storage()
            .instance()
            .get(&DataKey::Vote(proposal_id, voter))
            .ok_or(GovernanceError::ProposalNotFound)
    }

    /// Return the account currently receiving `delegator`'s voting power.
    pub fn get_delegation(env: Env, delegator: Address) -> Option<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Delegation(delegator))
    }

    /// Return all accounts whose voting power is currently delegated to `delegatee`.
    pub fn get_delegators(env: Env, delegatee: Address) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Delegators(delegatee))
            .unwrap_or(Vec::new(&env))
    }

    // -----------------------------------------------------------------------
    // Operation-scoped roles, admin handover, scoped pause, and upgrades
    // -----------------------------------------------------------------------

    /// Grant an operation-scoped governance role to an account.
    ///
    /// Requires `actor` authorization. The actor must hold the `Upgrade` role
    /// or be the contract admin, so role management can be delegated without
    /// surrendering admin control.
    pub fn grant_role(
        env: Env,
        actor: Address,
        account: Address,
        role: GovernanceRole,
    ) -> Result<(), GovernanceError> {
        actor.require_auth();
        assert_can_manage_role(&env, &actor, &role)?;

        if account_has_role(&env, &account, &role) {
            return Err(GovernanceError::RoleAlreadyAssigned);
        }

        env.storage().instance().set(
            &DataKey::GovernanceRole(account.clone(), role.clone()),
            &true,
        );

        RoleGrantedEvent {
            actor,
            account,
            role,
        }
        .publish(&env);

        Ok(())
    }

    /// Revoke an operation-scoped governance role from an account.
    ///
    /// Requires `actor` authorization and the same authority as
    /// [`grant_role`]. Revoking a role the account never held fails with
    /// `RoleNotAssigned`, so the history of role assignments cannot drift.
    pub fn revoke_role(
        env: Env,
        actor: Address,
        account: Address,
        role: GovernanceRole,
    ) -> Result<(), GovernanceError> {
        actor.require_auth();
        assert_can_manage_role(&env, &actor, &role)?;

        if !account_has_role(&env, &account, &role) {
            return Err(GovernanceError::RoleNotAssigned);
        }

        env.storage()
            .instance()
            .remove(&DataKey::GovernanceRole(account.clone(), role.clone()));

        RoleRevokedEvent {
            actor,
            account,
            role,
        }
        .publish(&env);

        Ok(())
    }

    /// Check whether an account holds an operation-scoped governance role.
    pub fn has_role(env: Env, account: Address, role: GovernanceRole) -> bool {
        account_has_role(&env, &account, &role)
    }

    /// Propose a new contract admin.
    ///
    /// Requires `actor` authorization and the actor must be the current admin.
    /// Only one transfer may be in flight at a time, and it expires
    /// `ADMIN_TRANSFER_TTL` seconds after it was proposed.
    pub fn propose_admin_transfer(
        env: Env,
        actor: Address,
        proposed_admin: Address,
    ) -> Result<(), GovernanceError> {
        actor.require_auth();
        let config = load_config(&env)?;

        if actor != config.admin {
            return Err(GovernanceError::Unauthorized);
        }
        if proposed_admin == config.admin {
            return Err(GovernanceError::InvalidInput);
        }
        if env.storage().instance().has(&DataKey::PendingAdminTransfer) {
            return Err(GovernanceError::AdminTransferPending);
        }

        let expires_at = env
            .ledger()
            .timestamp()
            .checked_add(ADMIN_TRANSFER_TTL)
            .ok_or(GovernanceError::Overflow)?;

        env.storage().instance().set(
            &DataKey::PendingAdminTransfer,
            &PendingAdminTransfer {
                proposed_admin,
                expires_at,
            },
        );

        Ok(())
    }

    /// Accept a pending admin transfer.
    ///
    /// Requires `actor` authorization and `actor` must be the proposed admin.
    /// On acceptance the pending transfer is cleared, `Config.admin` is
    /// replaced, and an `Accepted` record is appended to the admin-transfer
    /// history. A transfer that already expired fails with
    /// `AdminTransferExpired` and leaves the pending transfer untouched so it
    /// can still be swept.
    pub fn accept_admin_transfer(env: Env, actor: Address) -> Result<(), GovernanceError> {
        actor.require_auth();
        let config = load_config(&env)?;

        let pending: PendingAdminTransfer = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdminTransfer)
            .ok_or(GovernanceError::AdminTransferNotFound)?;

        if actor != pending.proposed_admin {
            return Err(GovernanceError::Unauthorized);
        }
        if env.ledger().timestamp() > pending.expires_at {
            return Err(GovernanceError::AdminTransferExpired);
        }

        env.storage()
            .instance()
            .remove(&DataKey::PendingAdminTransfer);

        let mut updated = config.clone();
        updated.admin = pending.proposed_admin.clone();
        env.storage().instance().set(&DataKey::Config, &updated);

        // The new admin inherits the role set of the admin it replaces.
        inherit_admin_roles(&env, &config.admin, &pending.proposed_admin);

        append_admin_transfer(
            &env,
            &config.admin,
            &pending.proposed_admin,
            &actor,
            REASON_ACCEPTED,
        )?;

        Ok(())
    }

    /// Cancel a pending admin transfer.
    ///
    /// Requires `actor` authorization and the actor must be the current admin.
    /// The cancelled attempt is recorded in the admin-transfer history with the
    /// terminal reason `Cancelled`.
    pub fn cancel_admin_transfer(env: Env, actor: Address) -> Result<(), GovernanceError> {
        actor.require_auth();
        let config = load_config(&env)?;

        if actor != config.admin {
            return Err(GovernanceError::Unauthorized);
        }

        let pending: PendingAdminTransfer = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdminTransfer)
            .ok_or(GovernanceError::AdminTransferNotFound)?;

        env.storage()
            .instance()
            .remove(&DataKey::PendingAdminTransfer);

        append_admin_transfer(
            &env,
            &config.admin,
            &pending.proposed_admin,
            &actor,
            REASON_CANCELLED,
        )?;

        Ok(())
    }

    /// Record the expiry of a lapsed admin transfer.
    ///
    /// Permissionless: anyone may sweep a transfer that ran out of time. The
    /// record's actor is the outgoing admin whose transfer expired. Returns
    /// whether an expired transfer was found.
    pub fn sweep_expired_admin_transfer(env: Env) -> Result<bool, GovernanceError> {
        let config = load_config(&env)?;

        let pending: Option<PendingAdminTransfer> =
            env.storage().instance().get(&DataKey::PendingAdminTransfer);

        let pending = match pending {
            Some(pending) => pending,
            None => return Ok(false),
        };

        if env.ledger().timestamp() <= pending.expires_at {
            return Ok(false);
        }

        env.storage()
            .instance()
            .remove(&DataKey::PendingAdminTransfer);

        append_admin_transfer(
            &env,
            &config.admin,
            &pending.proposed_admin,
            &config.admin,
            REASON_EXPIRED,
        )?;

        Ok(true)
    }

    /// Restore admin control through the recovery hierarchy.
    ///
    /// Requires `actor` authorization and the `Recovery` role. The current
    /// admin is replaced by `new_admin`, the new admin inherits the role set
    /// of the old admin, and the takeover is recorded in the admin-transfer
    /// history with the terminal reason `Accepted`. A pending transfer is
    /// superseded and recorded as `Cancelled`.
    pub fn recover_admin(
        env: Env,
        actor: Address,
        new_admin: Address,
    ) -> Result<(), GovernanceError> {
        actor.require_auth();
        assert_role(&env, &actor, &GovernanceRole::Recovery)?;

        let config = load_config(&env)?;
        if new_admin == config.admin {
            return Err(GovernanceError::InvalidInput);
        }

        let pending: Option<PendingAdminTransfer> =
            env.storage().instance().get(&DataKey::PendingAdminTransfer);
        if let Some(pending) = pending {
            env.storage()
                .instance()
                .remove(&DataKey::PendingAdminTransfer);
            append_admin_transfer(
                &env,
                &config.admin,
                &pending.proposed_admin,
                &actor,
                REASON_CANCELLED,
            )?;
        }

        let mut updated = config.clone();
        updated.admin = new_admin.clone();
        env.storage().instance().set(&DataKey::Config, &updated);

        // The new admin inherits the role set of the admin it replaces.
        inherit_admin_roles(&env, &config.admin, &new_admin);

        append_admin_transfer(&env, &config.admin, &new_admin, &actor, REASON_ACCEPTED)?;

        Ok(())
    }

    /// Pause one scope of the protocol.
    ///
    /// Requires `actor` authorization and the `Pause` role. The transition is
    /// appended to the pause history under a monotonic sequence number, so the
    /// order of incident responses can be proven from the history alone. The
    /// `Global` scope blocks proposal creation and voting while it is paused.
    pub fn execute_pause(
        env: Env,
        actor: Address,
        scope: String,
        incident_commitment: Option<String>,
    ) -> Result<u64, GovernanceError> {
        actor.require_auth();
        assert_role(&env, &actor, &GovernanceRole::Pause)?;

        if scope.is_empty() {
            return Err(GovernanceError::InvalidInput);
        }

        env.storage()
            .instance()
            .set(&DataKey::PauseScope(scope.clone()), &true);

        let record = append_pause_transition(&env, &scope, true, &actor, incident_commitment)?;

        PauseTransitionEvent {
            sequence: record.sequence,
            scope,
            is_paused: true,
            actor,
        }
        .publish(&env);

        Ok(record.sequence)
    }

    /// Resume one scope of the protocol.
    ///
    /// Requires `actor` authorization and the `Pause` role. The transition is
    /// appended to the pause history with `is_paused` set to false.
    pub fn execute_unpause(
        env: Env,
        actor: Address,
        scope: String,
    ) -> Result<u64, GovernanceError> {
        actor.require_auth();
        assert_role(&env, &actor, &GovernanceRole::Pause)?;

        if scope.is_empty() {
            return Err(GovernanceError::InvalidInput);
        }

        env.storage()
            .instance()
            .set(&DataKey::PauseScope(scope.clone()), &false);

        let record = append_pause_transition(&env, &scope, false, &actor, None)?;

        PauseTransitionEvent {
            sequence: record.sequence,
            scope,
            is_paused: false,
            actor,
        }
        .publish(&env);

        Ok(record.sequence)
    }

    /// Check whether one scope is currently paused.
    pub fn is_paused(env: Env, scope: String) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::PauseScope(scope))
            .unwrap_or(false)
    }

    /// Propose a protocol upgrade that role holders can approve.
    ///
    /// Requires `actor` authorization and the `Upgrade` role. The upgrade is
    /// pending until it expires, and it is indexed by its target hash so it
    /// can be found without knowing the proposal id.
    pub fn propose_upgrade(
        env: Env,
        actor: Address,
        proposal_id: String,
        target_hash: String,
        version: String,
        ttl: u64,
    ) -> Result<(), GovernanceError> {
        actor.require_auth();
        assert_role(&env, &actor, &GovernanceRole::Upgrade)?;

        if proposal_id.is_empty() || target_hash.is_empty() {
            return Err(GovernanceError::InvalidInput);
        }

        let mut pending: Map<String, PendingUpgradeApproval> = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrades)
            .unwrap_or(Map::new(&env));

        if pending.contains_key(proposal_id.clone()) {
            return Err(GovernanceError::UpgradeAlreadyPending);
        }

        let expires_at = env
            .ledger()
            .timestamp()
            .checked_add(ttl)
            .ok_or(GovernanceError::Overflow)?;

        pending.set(
            proposal_id.clone(),
            PendingUpgradeApproval {
                proposal_id: proposal_id.clone(),
                target_hash: target_hash.clone(),
                version: version.clone(),
                expires_at,
                approval_count: 0,
            },
        );
        env.storage()
            .instance()
            .set(&DataKey::PendingUpgrades, &pending);

        let mut hashes: Map<String, String> = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgradeHashes)
            .unwrap_or(Map::new(&env));
        hashes.set(target_hash.clone(), proposal_id.clone());
        env.storage()
            .instance()
            .set(&DataKey::PendingUpgradeHashes, &hashes);

        UpgradeProposedEvent {
            actor,
            proposal_id,
            target_hash,
            version,
        }
        .publish(&env);

        Ok(())
    }

    /// Approve a pending upgrade.
    ///
    /// Requires `actor` authorization and the `Upgrade` role. Every account
    /// counts once, so an account cannot inflate the approval count by
    /// approving twice. Returns the new approval count.
    pub fn approve_upgrade(
        env: Env,
        actor: Address,
        proposal_id: String,
    ) -> Result<u32, GovernanceError> {
        actor.require_auth();
        assert_role(&env, &actor, &GovernanceRole::Upgrade)?;

        let mut pending: Map<String, PendingUpgradeApproval> = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrades)
            .unwrap_or(Map::new(&env));

        let mut record = pending
            .get(proposal_id.clone())
            .ok_or(GovernanceError::UpgradeNotFound)?;

        if env.ledger().timestamp() > record.expires_at {
            return Err(GovernanceError::UpgradeExpired);
        }

        let mut approvers: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::UpgradeApprovals(proposal_id.clone()))
            .unwrap_or(Vec::new(&env));

        if approvers.iter().any(|approver| approver == actor) {
            return Err(GovernanceError::UpgradeAlreadyApproved);
        }

        approvers.push_back(actor.clone());
        env.storage()
            .instance()
            .set(&DataKey::UpgradeApprovals(proposal_id.clone()), &approvers);

        record.approval_count = record
            .approval_count
            .checked_add(1)
            .ok_or(GovernanceError::Overflow)?;

        pending.set(proposal_id.clone(), record.clone());
        env.storage()
            .instance()
            .set(&DataKey::PendingUpgrades, &pending);

        UpgradeApprovedEvent {
            approver: actor,
            proposal_id,
            approval_count: record.approval_count,
        }
        .publish(&env);

        Ok(record.approval_count)
    }

    /// Remove pending upgrades that expired.
    ///
    /// Permissionless. Returns the number of expired upgrades that were
    /// removed so the caller can observe the cleanup.
    pub fn sweep_expired_upgrades(env: Env) -> Result<u32, GovernanceError> {
        let mut pending: Map<String, PendingUpgradeApproval> = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrades)
            .unwrap_or(Map::new(&env));

        if pending.is_empty() {
            return Ok(0);
        }

        let now = env.ledger().timestamp();
        let mut expired: Vec<String> = Vec::new(&env);
        for (proposal_id, record) in pending.iter() {
            if now > record.expires_at {
                expired.push_back(proposal_id);
            }
        }

        if expired.is_empty() {
            return Ok(0);
        }

        let mut hashes: Map<String, String> = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgradeHashes)
            .unwrap_or(Map::new(&env));

        let mut removed = 0_u32;
        for proposal_id in expired.iter() {
            let record = match pending.get(proposal_id.clone()) {
                Some(record) => record,
                None => continue,
            };

            pending.remove(proposal_id.clone());
            hashes.remove(record.target_hash);
            env.storage()
                .instance()
                .remove(&DataKey::UpgradeApprovals(proposal_id.clone()));
            removed += 1;

            UpgradeExpiredEvent {
                proposal_id: proposal_id.clone(),
            }
            .publish(&env);
        }

        env.storage()
            .instance()
            .set(&DataKey::PendingUpgrades, &pending);
        env.storage()
            .instance()
            .set(&DataKey::PendingUpgradeHashes, &hashes);

        Ok(removed)
    }

    /// Read one pending upgrade by its proposal id.
    pub fn get_pending_upgrade(env: Env, proposal_id: String) -> Option<PendingUpgradeApproval> {
        let pending: Map<String, PendingUpgradeApproval> = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrades)
            .unwrap_or(Map::new(&env));

        pending.get(proposal_id)
    }

    /// Read one pending upgrade by the hash of its target build.
    pub fn get_pending_upgrade_by_hash(
        env: Env,
        target_hash: String,
    ) -> Option<PendingUpgradeApproval> {
        let hashes: Map<String, String> = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgradeHashes)
            .unwrap_or(Map::new(&env));

        let proposal_id = hashes.get(target_hash)?;

        let pending: Map<String, PendingUpgradeApproval> = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrades)
            .unwrap_or(Map::new(&env));

        pending.get(proposal_id)
    }

    /// Read the admin-transfer history, oldest sequence first.
    ///
    /// Bounded query: `start_after` skips every record up to and including the
    /// given sequence, and `limit` caps the number of returned records.
    pub fn get_admin_transfer_history(
        env: Env,
        start_after: Option<u64>,
        limit: Option<u32>,
    ) -> Vec<AdminTransferRecord> {
        let history: Map<u64, AdminTransferRecord> = env
            .storage()
            .instance()
            .get(&DataKey::AdminTransferHistory)
            .unwrap_or(Map::new(&env));

        let limit = bounded_limit(limit);
        let mut result = Vec::new(&env);

        for (sequence, record) in history.iter() {
            if let Some(start) = start_after {
                if sequence <= start {
                    continue;
                }
            }
            result.push_back(record);
            if result.len() >= limit {
                break;
            }
        }

        result
    }

    /// Read the scoped pause-transition history, oldest sequence first.
    ///
    /// Bounded query: `scope` restricts the result to one scope, `start_after`
    /// skips every record up to and including the given sequence, and `limit`
    /// caps the number of returned records.
    pub fn get_pause_history(
        env: Env,
        scope: Option<String>,
        start_after: Option<u64>,
        limit: Option<u32>,
    ) -> Vec<PauseTransitionRecord> {
        let history: Map<u64, PauseTransitionRecord> = env
            .storage()
            .instance()
            .get(&DataKey::PauseHistory)
            .unwrap_or(Map::new(&env));

        let limit = bounded_limit(limit);
        let filter = scope.clone();
        let mut result = Vec::new(&env);

        for (sequence, record) in history.iter() {
            if let Some(scope) = filter.clone() {
                if record.scope != scope {
                    continue;
                }
            }
            if let Some(start) = start_after {
                if sequence <= start {
                    continue;
                }
            }
            result.push_back(record);
            if result.len() >= limit {
                break;
            }
        }

        result
    }

    /// Read the pending upgrades that have not expired, ordered by proposal id.
    ///
    /// Bounded query: `start_after` skips every proposal up to and including
    /// the given proposal id, and `limit` caps the number of returned records.
    pub fn get_pending_upgrades(
        env: Env,
        start_after: Option<String>,
        limit: Option<u32>,
    ) -> Vec<PendingUpgradeApproval> {
        let pending: Map<String, PendingUpgradeApproval> = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrades)
            .unwrap_or(Map::new(&env));

        let limit = bounded_limit(limit);
        let now = env.ledger().timestamp();
        let start = start_after.clone();
        let mut result = Vec::new(&env);

        for (proposal_id, record) in pending.iter() {
            if now > record.expires_at {
                continue;
            }
            if let Some(start) = start.clone() {
                if proposal_id <= start {
                    continue;
                }
            }
            result.push_back(record);
            if result.len() >= limit {
                break;
            }
        }

        result
    }
}

fn remove_delegator(env: &Env, delegatee: &Address, delegator: &Address) {
    let mut delegators: Vec<Address> = env
        .storage()
        .instance()
        .get(&DataKey::Delegators(delegatee.clone()))
        .unwrap_or(Vec::new(env));

    let mut index = 0_u32;
    while index < delegators.len() {
        if delegators.get(index) == Some(delegator.clone()) {
            delegators.remove(index);
            break;
        }
        index += 1;
    }

    if delegators.is_empty() {
        env.storage()
            .instance()
            .remove(&DataKey::Delegators(delegatee.clone()));
    } else {
        env.storage()
            .instance()
            .set(&DataKey::Delegators(delegatee.clone()), &delegators);
    }
}

fn participation_basis_points(
    participation: i128,
    total_supply: i128,
) -> Result<u32, GovernanceError> {
    let basis_points = participation
        .checked_mul(10_000)
        .ok_or(GovernanceError::Overflow)?
        .checked_div(total_supply)
        .ok_or(GovernanceError::InvalidInput)?;

    Ok(if basis_points > 10_000 {
        10_000
    } else {
        basis_points as u32
    })
}

/// Load the singleton configuration.
fn load_config(env: &Env) -> Result<Config, GovernanceError> {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .ok_or(GovernanceError::NotInitialized)
}

/// Every operation-scoped governance role.
fn all_roles(env: &Env) -> Vec<GovernanceRole> {
    let mut roles = Vec::new(env);
    roles.push_back(GovernanceRole::Pause);
    roles.push_back(GovernanceRole::Schema);
    roles.push_back(GovernanceRole::Issuer);
    roles.push_back(GovernanceRole::Revocation);
    roles.push_back(GovernanceRole::Upgrade);
    roles.push_back(GovernanceRole::Recovery);
    roles
}

/// Whether an account holds a governance role.
fn account_has_role(env: &Env, account: &Address, role: &GovernanceRole) -> bool {
    env.storage()
        .instance()
        .has(&DataKey::GovernanceRole(account.clone(), role.clone()))
}

/// Centralized role authorization guard.
///
/// Every role-gated operation funnels through this check, so the role set is
/// the single source of truth for what an account may do.
pub fn assert_role(
    env: &Env,
    account: &Address,
    role: &GovernanceRole,
) -> Result<(), GovernanceError> {
    if account_has_role(env, account, role) {
        Ok(())
    } else {
        Err(GovernanceError::Unauthorized)
    }
}

/// Copy the role set of one admin onto its successor.
/// Moves the outgoing admin's roles to the new admin.
///
/// The roles leave the old address rather than being copied: after a recovery
/// the old key may be the compromised one, and a lingering `Recovery` role
/// would let it take the seat straight back.
fn inherit_admin_roles(env: &Env, old_admin: &Address, new_admin: &Address) {
    if old_admin == new_admin {
        return;
    }
    for role in all_roles(env) {
        if account_has_role(env, old_admin, &role) {
            env.storage()
                .instance()
                .remove(&DataKey::GovernanceRole(old_admin.clone(), role.clone()));
            env.storage()
                .instance()
                .set(&DataKey::GovernanceRole(new_admin.clone(), role), &true);
        }
    }
}

/// Guard for role management: the contract admin or an `Upgrade` role holder.
/// Who may grant or revoke `role`.
///
/// `Upgrade` and `Recovery` control the contract itself: an account that could
/// hand them out could grant itself `Recovery` and take the admin seat through
/// [`GovernanceContract::recover_admin`]. Only the admin manages those two; the
/// admin or an `Upgrade` holder manages the operational roles.
fn assert_can_manage_role(
    env: &Env,
    actor: &Address,
    role: &GovernanceRole,
) -> Result<(), GovernanceError> {
    match role {
        GovernanceRole::Upgrade | GovernanceRole::Recovery => {
            if actor == &load_config(env)?.admin {
                Ok(())
            } else {
                Err(GovernanceError::Unauthorized)
            }
        }
        _ => assert_admin_or_upgrader(env, actor),
    }
}

fn assert_admin_or_upgrader(env: &Env, account: &Address) -> Result<(), GovernanceError> {
    if account_has_role(env, account, &GovernanceRole::Upgrade) {
        return Ok(());
    }

    let config = load_config(env)?;
    if account == &config.admin {
        return Ok(());
    }

    Err(GovernanceError::Unauthorized)
}

/// Guard for operations that a scoped pause blocks.
fn assert_not_paused(env: &Env, scope: &str) -> Result<(), GovernanceError> {
    let paused: bool = env
        .storage()
        .instance()
        .get(&DataKey::PauseScope(String::from_str(env, scope)))
        .unwrap_or(false);

    if paused {
        Err(GovernanceError::ProtocolPaused)
    } else {
        Ok(())
    }
}

/// Append a terminal admin-transfer record to the history.
fn append_admin_transfer(
    env: &Env,
    old_admin: &Address,
    proposed_admin: &Address,
    actor: &Address,
    terminal_reason: &str,
) -> Result<u64, GovernanceError> {
    let mut sequence: u64 = env
        .storage()
        .instance()
        .get(&DataKey::AdminHistorySeq)
        .unwrap_or(0);
    sequence = sequence.checked_add(1).ok_or(GovernanceError::Overflow)?;

    let record = AdminTransferRecord {
        sequence,
        old_admin: old_admin.clone(),
        proposed_admin: proposed_admin.clone(),
        actor: actor.clone(),
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
        terminal_reason: String::from_str(env, terminal_reason),
    };

    let mut history: Map<u64, AdminTransferRecord> = env
        .storage()
        .instance()
        .get(&DataKey::AdminTransferHistory)
        .unwrap_or(Map::new(env));
    history.set(sequence, record.clone());
    env.storage()
        .instance()
        .set(&DataKey::AdminTransferHistory, &history);
    env.storage()
        .instance()
        .set(&DataKey::AdminHistorySeq, &sequence);

    AdminTransferEvent {
        sequence,
        old_admin: old_admin.clone(),
        proposed_admin: proposed_admin.clone(),
        actor: actor.clone(),
        terminal_reason: record.terminal_reason.clone(),
    }
    .publish(env);

    Ok(sequence)
}

/// Append a pause-transition record to the history.
fn append_pause_transition(
    env: &Env,
    scope: &String,
    is_paused: bool,
    actor: &Address,
    incident_commitment: Option<String>,
) -> Result<PauseTransitionRecord, GovernanceError> {
    let mut sequence: u64 = env
        .storage()
        .instance()
        .get(&DataKey::PauseHistorySeq)
        .unwrap_or(0);
    sequence = sequence.checked_add(1).ok_or(GovernanceError::Overflow)?;

    let record = PauseTransitionRecord {
        sequence,
        scope: scope.clone(),
        is_paused,
        actor: actor.clone(),
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
        incident_commitment,
    };

    let mut history: Map<u64, PauseTransitionRecord> = env
        .storage()
        .instance()
        .get(&DataKey::PauseHistory)
        .unwrap_or(Map::new(env));
    history.set(sequence, record.clone());
    env.storage()
        .instance()
        .set(&DataKey::PauseHistory, &history);
    env.storage()
        .instance()
        .set(&DataKey::PauseHistorySeq, &sequence);

    Ok(record)
}

/// Clamp a requested query limit to the supported range.
fn bounded_limit(limit: Option<u32>) -> u32 {
    match limit {
        Some(value) if value > MAX_QUERY_LIMIT => MAX_QUERY_LIMIT,
        Some(value) => value,
        None => DEFAULT_QUERY_LIMIT,
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::token::StellarAssetClient;
    use soroban_sdk::{vec, Env};

    fn setup_test() -> (
        Env,
        Address,
        Address,
        Address,
        GovernanceContractClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000_000);

        let admin = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token = sac.address();

        let contract_id = env.register(GovernanceContract, ());
        let client = GovernanceContractClient::new(&env, &contract_id);

        client.initialize(&admin, &token, &86400, &5000, &10_000);

        (env, admin, token_admin, token, client)
    }

    // Helper: create a proposal and advance past its voting window

    /// Creates a proposal, optionally mints tokens to `voter` and casts a FOR
    /// vote, then advances the ledger past `voting_ends_at` and calls
    /// `finalize_proposal`.  Returns `(proposal_id, voter_address)`.
    fn create_and_finalize(
        env: &Env,
        client: &GovernanceContractClient,
        token: &Address,
        voter_balance: i128,
    ) -> (u64, Address) {
        let proposer = Address::generate(env);
        let voter = Address::generate(env);

        if voter_balance > 0 {
            StellarAssetClient::new(env, token).mint(&voter, &voter_balance);
        }

        let title = String::from_str(env, "Community Grant");
        let desc = String::from_str(env, "Fund local water project");
        let actions = vec![
            env,
            String::from_str(env, "disburse_treasury:500"),
            String::from_str(env, "notify_members"),
        ];

        let id = client.create_proposal(&proposer, &title, &desc, &actions);

        if voter_balance > 0 {
            client.cast_vote(&id, &VoteChoice::For, &voter);
        }

        // Advance past voting_ends_at (1_000_000 + 86400 = 1_086_400)
        env.ledger().set_timestamp(1_086_401);
        client.finalize_proposal(&id);

        (id, voter)
    }

    // Existing tests

    #[test]
    fn test_initialize_and_get_config() {
        let (_env, admin, _token_admin, token, client) = setup_test();
        let config = client.get_config();
        assert_eq!(config.admin, admin);
        assert_eq!(config.governance_token, token);
        assert_eq!(config.voting_period, 86400);
        assert_eq!(config.quorum_bps, 5000);
        assert_eq!(config.total_supply, 10_000);
    }

    #[test]
    fn test_create_proposal_succeeds() {
        let (env, _admin, _token_admin, _token, client) = setup_test();
        let proposer = Address::generate(&env);

        let title = String::from_str(&env, "Community Treasury Grant");
        let description = String::from_str(&env, "Allocate 500 tokens for local water project");
        let actions = vec![&env, String::from_str(&env, "disburse_treasury:500")];

        let proposal_id = client.create_proposal(&proposer, &title, &description, &actions);
        assert_eq!(proposal_id, 1);

        let proposal = client.get_proposal(&proposal_id);
        assert_eq!(proposal.proposal_id, 1);
        assert_eq!(proposal.proposer, proposer);
        assert_eq!(proposal.title, title);
        assert_eq!(proposal.description, description);
        assert_eq!(proposal.votes_for, 0);
        assert_eq!(proposal.votes_against, 0);
        assert_eq!(proposal.status, ProposalStatus::Active);
        assert_eq!(proposal.created_at, 1_000_000);
        assert_eq!(proposal.voting_ends_at, 1_000_000 + 86400);
    }

    #[test]
    fn test_cast_vote_token_weighted_tally() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let proposer = Address::generate(&env);
        let voter1 = Address::generate(&env);
        let voter2 = Address::generate(&env);

        // Mint governance tokens to voters
        let sac = StellarAssetClient::new(&env, &token);
        sac.mint(&voter1, &1000);
        sac.mint(&voter2, &500);

        let title = String::from_str(&env, "Upgrade Protocol");
        let description = String::from_str(&env, "Upgrade contract WASM");
        let actions = vec![&env, String::from_str(&env, "upgrade")];

        let id = client.create_proposal(&proposer, &title, &description, &actions);

        // Voter 1 votes FOR (1000 weight)
        client.cast_vote(&id, &VoteChoice::For, &voter1);
        let p1 = client.get_proposal(&id);
        assert_eq!(p1.votes_for, 1000);
        assert_eq!(p1.votes_against, 0);

        let vote1 = client.get_vote(&id, &voter1);
        assert_eq!(vote1.weight, 1000);
        assert_eq!(vote1.choice, VoteChoice::For);

        // Voter 2 votes AGAINST (500 weight)
        client.cast_vote(&id, &VoteChoice::Against, &voter2);
        let p2 = client.get_proposal(&id);
        assert_eq!(p2.votes_for, 1000);
        assert_eq!(p2.votes_against, 500);
    }

    #[test]
    fn test_delegatee_votes_with_current_delegated_power() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let proposer = Address::generate(&env);
        let delegator = Address::generate(&env);
        let delegatee = Address::generate(&env);
        let sac = StellarAssetClient::new(&env, &token);
        sac.mint(&delegator, &700);
        sac.mint(&delegatee, &300);

        client.delegate(&delegator, &delegatee);
        sac.mint(&delegator, &100);

        let id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "Delegated ballot"),
            &String::from_str(&env, "Count represented voting power"),
            &vec![&env],
        );
        client.cast_vote(&id, &VoteChoice::For, &delegatee);

        assert_eq!(client.get_delegation(&delegator), Some(delegatee.clone()));
        assert_eq!(client.get_delegators(&delegatee), vec![&env, delegator]);
        assert_eq!(client.get_proposal(&id).votes_for, 1_100);
        assert_eq!(client.get_vote(&id, &delegatee).weight, 1_100);
    }

    #[test]
    fn test_delegator_cannot_vote_until_delegation_is_revoked() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let proposer = Address::generate(&env);
        let delegator = Address::generate(&env);
        let delegatee = Address::generate(&env);
        StellarAssetClient::new(&env, &token).mint(&delegator, &500);
        client.delegate(&delegator, &delegatee);

        let id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "Direct ballot"),
            &String::from_str(&env, "Revoke before direct voting"),
            &vec![&env],
        );
        assert_eq!(
            client
                .try_cast_vote(&id, &VoteChoice::For, &delegator)
                .unwrap_err()
                .unwrap(),
            GovernanceError::VotingPowerDelegated
        );

        client.undelegate(&delegator);
        assert_eq!(client.get_delegation(&delegator), None);
        assert!(client.get_delegators(&delegatee).is_empty());
        client.cast_vote(&id, &VoteChoice::For, &delegator);
        assert_eq!(client.get_proposal(&id).votes_for, 500);
    }

    #[test]
    fn test_delegated_power_cannot_be_counted_after_direct_vote() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let proposer = Address::generate(&env);
        let delegator = Address::generate(&env);
        let delegatee = Address::generate(&env);
        let sac = StellarAssetClient::new(&env, &token);
        sac.mint(&delegator, &600);
        sac.mint(&delegatee, &400);

        let id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "No double count"),
            &String::from_str(&env, "One balance, one ballot"),
            &vec![&env],
        );
        client.cast_vote(&id, &VoteChoice::For, &delegator);
        client.delegate(&delegator, &delegatee);

        assert_eq!(
            client
                .try_cast_vote(&id, &VoteChoice::For, &delegatee)
                .unwrap_err()
                .unwrap(),
            GovernanceError::AlreadyVoted
        );
        assert_eq!(client.get_proposal(&id).votes_for, 600);
    }

    #[test]
    fn test_delegation_rejects_self_and_multi_hop_chains() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let first = Address::generate(&env);
        let second = Address::generate(&env);
        let third = Address::generate(&env);
        let sac = StellarAssetClient::new(&env, &token);
        sac.mint(&first, &100);
        sac.mint(&second, &100);
        sac.mint(&third, &100);

        assert_eq!(
            client.try_delegate(&first, &first).unwrap_err().unwrap(),
            GovernanceError::CannotDelegateToSelf
        );

        client.delegate(&first, &second);
        assert_eq!(
            client.try_delegate(&second, &third).unwrap_err().unwrap(),
            GovernanceError::InvalidDelegation
        );
        assert_eq!(
            client.try_delegate(&third, &first).unwrap_err().unwrap(),
            GovernanceError::InvalidDelegation
        );
    }

    #[test]
    fn test_cast_vote_fails_without_tokens() {
        let (env, _admin, _token_admin, _token, client) = setup_test();
        let proposer = Address::generate(&env);
        let broke_voter = Address::generate(&env);

        let title = String::from_str(&env, "Proposal 1");
        let desc = String::from_str(&env, "Desc 1");
        let actions = vec![&env];

        let id = client.create_proposal(&proposer, &title, &desc, &actions);

        let err = client
            .try_cast_vote(&id, &VoteChoice::For, &broke_voter)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, GovernanceError::NoVotingPower);
    }

    #[test]
    fn test_cast_vote_prevents_double_voting() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);

        StellarAssetClient::new(&env, &token).mint(&voter, &500);

        let title = String::from_str(&env, "Proposal 1");
        let desc = String::from_str(&env, "Desc 1");
        let actions = vec![&env];

        let id = client.create_proposal(&proposer, &title, &desc, &actions);

        client.cast_vote(&id, &VoteChoice::For, &voter);

        let err = client
            .try_cast_vote(&id, &VoteChoice::For, &voter)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, GovernanceError::AlreadyVoted);
    }

    #[test]
    fn test_cast_vote_after_voting_period_fails() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);

        StellarAssetClient::new(&env, &token).mint(&voter, &500);

        let title = String::from_str(&env, "Proposal 1");
        let desc = String::from_str(&env, "Desc 1");
        let actions = vec![&env];

        let id = client.create_proposal(&proposer, &title, &desc, &actions);

        // Fast forward ledger timestamp past voting_ends_at
        env.ledger().set_timestamp(1_000_000 + 86401);

        let err = client
            .try_cast_vote(&id, &VoteChoice::For, &voter)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, GovernanceError::VotingPeriodEnded);
    }

    // finalize_proposal tests

    #[test]
    fn test_finalize_proposal_passed() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);

        StellarAssetClient::new(&env, &token).mint(&voter, &1000);

        let id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "T"),
            &String::from_str(&env, "D"),
            &vec![&env],
        );

        client.cast_vote(&id, &VoteChoice::For, &voter);

        env.ledger().set_timestamp(1_086_401);
        let status = client.finalize_proposal(&id);
        assert_eq!(status, ProposalStatus::Passed);
        assert_eq!(client.get_proposal(&id).status, ProposalStatus::Passed);
    }

    #[test]
    fn test_finalize_proposal_rejected() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);

        StellarAssetClient::new(&env, &token).mint(&voter, &1000);

        let id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "T"),
            &String::from_str(&env, "D"),
            &vec![&env],
        );

        client.cast_vote(&id, &VoteChoice::Against, &voter);

        env.ledger().set_timestamp(1_086_401);
        let status = client.finalize_proposal(&id);
        assert_eq!(status, ProposalStatus::Rejected);
    }

    #[test]
    fn test_finalize_proposal_fails_while_voting_open() {
        let (env, _admin, _token_admin, _token, client) = setup_test();
        let proposer = Address::generate(&env);

        let id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "T"),
            &String::from_str(&env, "D"),
            &vec![&env],
        );

        // Still within voting window — should fail
        let err = client.try_finalize_proposal(&id).unwrap_err().unwrap();
        assert_eq!(err, GovernanceError::VotingPeriodEnded);
    }

    #[test]
    fn test_finalize_proposal_fails_if_already_finalized() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let (id, _) = create_and_finalize(&env, &client, &token, 1000);

        // Second call on an already-Passed proposal
        let err = client.try_finalize_proposal(&id).unwrap_err().unwrap();
        assert_eq!(err, GovernanceError::ProposalNotActive);
    }

    // execute_proposal tests

    /// Happy path: a passed, quorate proposal executes successfully and is
    /// marked `Executed`.
    #[test]
    fn test_execute_proposal_success() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let executor = Address::generate(&env);

        // total_supply = 10_000 (from setup_test); quorum_bps = 5000 (50%)
        // required participation = 10_000 * 5000 / 10_000 = 5000
        // actual participation   = 6000 (FOR) >= 5000, so quorum is met
        let (id, _) = create_and_finalize(&env, &client, &token, 6000);

        client.execute_proposal(&id, &executor);

        let proposal = client.get_proposal(&id);
        assert_eq!(proposal.status, ProposalStatus::Executed);
    }

    /// Executing a proposal that is already `Executed` returns
    /// `ProposalExecutionFailed`.
    #[test]
    fn test_execute_proposal_already_executed() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let executor = Address::generate(&env);

        let (id, _) = create_and_finalize(&env, &client, &token, 6000);
        client.execute_proposal(&id, &executor);

        let err = client
            .try_execute_proposal(&id, &executor)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, GovernanceError::ProposalExecutionFailed);
    }

    /// Trying to execute a `Rejected` proposal returns `ProposalExecutionFailed`.
    #[test]
    fn test_execute_proposal_not_passed() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        let executor = Address::generate(&env);

        StellarAssetClient::new(&env, &token).mint(&voter, &1000);

        let id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "T"),
            &String::from_str(&env, "D"),
            &vec![&env],
        );

        // Vote AGAINST so it becomes Rejected
        client.cast_vote(&id, &VoteChoice::Against, &voter);
        env.ledger().set_timestamp(1_086_401);
        client.finalize_proposal(&id);

        assert_eq!(client.get_proposal(&id).status, ProposalStatus::Rejected);

        let err = client
            .try_execute_proposal(&id, &executor)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, GovernanceError::ProposalExecutionFailed);
    }

    /// Trying to execute a still-`Active` proposal (not yet finalised) returns
    /// `ProposalExecutionFailed`.
    #[test]
    fn test_execute_proposal_still_active() {
        let (env, _admin, _token_admin, _token, client) = setup_test();
        let proposer = Address::generate(&env);
        let executor = Address::generate(&env);

        let id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "T"),
            &String::from_str(&env, "D"),
            &vec![&env],
        );

        let err = client
            .try_execute_proposal(&id, &executor)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, GovernanceError::ProposalExecutionFailed);
    }

    /// When total participation falls below the quorum threshold,
    /// `InsufficientQuorum` is returned and the proposal remains `Passed`
    /// (so it can be re-attempted once more votes are cast — but since
    /// the window is closed that is not possible; the proposal simply
    /// cannot execute).
    #[test]
    fn test_execute_proposal_quorum_not_met() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        let bystander = Address::generate(&env);
        let executor = Address::generate(&env);

        // Mint 1000 to voter and 9000 to bystander (who does NOT vote).
        // total_supply = 10_000
        // quorum_bps   = 5000 (50%) → required = 5000
        // votes_for    = 1000 (only voter voted)
        // participation < required → InsufficientQuorum
        StellarAssetClient::new(&env, &token).mint(&voter, &1_000);
        StellarAssetClient::new(&env, &token).mint(&bystander, &9_000);

        let id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "T"),
            &String::from_str(&env, "D"),
            &vec![&env, String::from_str(&env, "some_action")],
        );

        client.cast_vote(&id, &VoteChoice::For, &voter);

        env.ledger().set_timestamp(1_086_401);
        client.finalize_proposal(&id);

        // Proposal is Passed (more FOR than AGAINST) but quorum not met.
        assert_eq!(client.get_proposal(&id).status, ProposalStatus::Passed);

        let err = client
            .try_execute_proposal(&id, &executor)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, GovernanceError::InsufficientQuorum);

        // Status must remain Passed so nothing is lost.
        assert_eq!(client.get_proposal(&id).status, ProposalStatus::Passed);
    }

    /// When quorum is set to zero, any passed proposal can execute regardless
    /// of participation (edge case: permissionless communities).
    #[test]
    fn test_execute_proposal_zero_quorum() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000_000);

        let admin = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token = sac.address();
        let contract_id = env.register(GovernanceContract, ());
        let client = GovernanceContractClient::new(&env, &contract_id);

        // quorum_bps = 0 → required = 0
        client.initialize(&admin, &token, &86400, &0, &1_000_000);

        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        let executor = Address::generate(&env);

        StellarAssetClient::new(&env, &token).mint(&voter, &100);

        let id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "T"),
            &String::from_str(&env, "D"),
            &vec![&env, String::from_str(&env, "ping")],
        );

        client.cast_vote(&id, &VoteChoice::For, &voter);
        env.ledger().set_timestamp(1_086_401);
        client.finalize_proposal(&id);

        // Should succeed even though only 100 of 100 tokens voted
        // (participation = 100 >= required = 0)
        client.execute_proposal(&id, &executor);
        assert_eq!(client.get_proposal(&id).status, ProposalStatus::Executed);
    }

    /// Executing a non-existent proposal returns `ProposalNotFound`.
    #[test]
    fn test_execute_proposal_not_found() {
        let (env, _admin, _token_admin, _token, client) = setup_test();
        let executor = Address::generate(&env);

        let err = client
            .try_execute_proposal(&99, &executor)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, GovernanceError::ProposalNotFound);
    }

    #[test]
    fn test_get_proposal_before_initialize_returns_not_initialized() {
        // A contract that has been deployed but never initialized has no config,
        // so the read path reports NotInitialized rather than pretending the
        // proposal simply does not exist.
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(GovernanceContract, ());
        let client = GovernanceContractClient::new(&env, &contract_id);

        let err = client.try_get_proposal(&1).unwrap_err().unwrap();
        assert_eq!(err, GovernanceError::NotInitialized);
    }

    #[test]
    fn test_get_proposal_unknown_id_returns_proposal_not_found() {
        let (_env, _admin, _token_admin, _token, client) = setup_test();

        let err = client.try_get_proposal(&42).unwrap_err().unwrap();
        assert_eq!(err, GovernanceError::ProposalNotFound);
    }

    #[test]
    fn test_get_proposal_returns_independent_records_per_id() {
        let (env, _admin, _token_admin, _token, client) = setup_test();
        let proposer = Address::generate(&env);

        let first_id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "First"),
            &String::from_str(&env, "First description"),
            &vec![&env, String::from_str(&env, "action:a")],
        );
        let second_id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "Second"),
            &String::from_str(&env, "Second description"),
            &vec![
                &env,
                String::from_str(&env, "action:b"),
                String::from_str(&env, "action:c"),
            ],
        );

        assert_eq!(first_id, 1);
        assert_eq!(second_id, 2);

        let first = client.get_proposal(&first_id);
        let second = client.get_proposal(&second_id);

        assert_eq!(first.proposal_id, 1);
        assert_eq!(second.proposal_id, 2);
        assert_eq!(first.title, String::from_str(&env, "First"));
        assert_eq!(second.title, String::from_str(&env, "Second"));
        assert_eq!(
            first.description,
            String::from_str(&env, "First description")
        );
        assert_eq!(
            second.description,
            String::from_str(&env, "Second description")
        );
        assert_eq!(first.actions.len(), 1);
        assert_eq!(second.actions.len(), 2);
        assert_eq!(first.proposer, proposer);
        assert_eq!(second.proposer, proposer);

        // Reading one proposal must not disturb the other.
        let first_again = client.get_proposal(&first_id);
        assert_eq!(first_again.title, first.title);
        assert_eq!(first_again.actions, first.actions);
        assert_eq!(first_again.votes_for, 0);
    }

    #[test]
    fn test_get_proposal_tally_matches_votes_after_each_cast() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let proposer = Address::generate(&env);
        let voter_for = Address::generate(&env);
        let voter_against = Address::generate(&env);

        let sac = StellarAssetClient::new(&env, &token);
        sac.mint(&voter_for, &750);
        sac.mint(&voter_against, &250);

        let id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "Tally"),
            &String::from_str(&env, "Tally description"),
            &vec![&env],
        );

        let fresh = client.get_proposal(&id);
        assert_eq!(fresh.votes_for, 0);
        assert_eq!(fresh.votes_against, 0);
        assert_eq!(fresh.status, ProposalStatus::Active);

        client.cast_vote(&id, &VoteChoice::Against, &voter_against);
        let after_against = client.get_proposal(&id);
        assert_eq!(after_against.votes_for, 0);
        assert_eq!(after_against.votes_against, 250);

        client.cast_vote(&id, &VoteChoice::For, &voter_for);
        let after_for = client.get_proposal(&id);
        assert_eq!(after_for.votes_for, 750);
        assert_eq!(after_for.votes_against, 250);
        assert_eq!(after_for.status, ProposalStatus::Active);
    }

    #[test]
    fn test_governance_analytics_are_zero_safe() {
        let (_env, _admin, _token_admin, _token, client) = setup_test();

        assert_eq!(
            client.get_analytics(),
            GovernanceAnalytics {
                total_proposals: 0,
                active_proposals: 0,
                finalized_proposals: 0,
                passed_proposals: 0,
                rejected_proposals: 0,
                executed_proposals: 0,
                total_voting_power_cast: 0,
                voter_turnout_bps: 0,
                average_quorum_bps: 0,
                proposal_pass_rate_bps: 0,
            }
        );
    }

    #[test]
    fn test_governance_analytics_report_turnout_quorum_and_pass_rate() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let proposer = Address::generate(&env);
        let voter_for = Address::generate(&env);
        let voter_against = Address::generate(&env);
        let active_voter = Address::generate(&env);
        let sac = StellarAssetClient::new(&env, &token);
        sac.mint(&voter_for, &6_000);
        sac.mint(&voter_against, &2_000);
        sac.mint(&active_voter, &1_000);

        let passed_id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "Passed"),
            &String::from_str(&env, "Sixty percent turnout"),
            &vec![&env],
        );
        let rejected_id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "Rejected"),
            &String::from_str(&env, "Twenty percent turnout"),
            &vec![&env],
        );
        let active_id = client.create_proposal(
            &proposer,
            &String::from_str(&env, "Active"),
            &String::from_str(&env, "Ten percent live turnout"),
            &vec![&env],
        );

        client.cast_vote(&passed_id, &VoteChoice::For, &voter_for);
        client.cast_vote(&rejected_id, &VoteChoice::Against, &voter_against);
        client.cast_vote(&active_id, &VoteChoice::For, &active_voter);

        env.ledger().set_timestamp(1_086_401);
        client.finalize_proposal(&passed_id);
        client.finalize_proposal(&rejected_id);

        let analytics = client.get_analytics();
        assert_eq!(analytics.total_proposals, 3);
        assert_eq!(analytics.active_proposals, 1);
        assert_eq!(analytics.finalized_proposals, 2);
        assert_eq!(analytics.passed_proposals, 1);
        assert_eq!(analytics.rejected_proposals, 1);
        assert_eq!(analytics.executed_proposals, 0);
        assert_eq!(analytics.total_voting_power_cast, 9_000);
        assert_eq!(analytics.voter_turnout_bps, 3_000);
        assert_eq!(analytics.average_quorum_bps, 4_000);
        assert_eq!(analytics.proposal_pass_rate_bps, 5_000);
    }

    #[test]
    fn test_governance_analytics_count_executed_as_passed() {
        let (env, _admin, _token_admin, token, client) = setup_test();
        let executor = Address::generate(&env);
        let (proposal_id, _) = create_and_finalize(&env, &client, &token, 6_000);
        client.execute_proposal(&proposal_id, &executor);

        let analytics = client.get_analytics();
        assert_eq!(analytics.finalized_proposals, 1);
        assert_eq!(analytics.passed_proposals, 1);
        assert_eq!(analytics.executed_proposals, 1);
        assert_eq!(analytics.average_quorum_bps, 6_000);
        assert_eq!(analytics.proposal_pass_rate_bps, 10_000);
    }

    // Operation-scoped roles, admin handover, scoped pause, and upgrades

    #[test]
    fn test_initialize_grants_every_role_to_the_admin() {
        let (env, admin, _token_admin, _token, client) = setup_test();

        for role in [
            GovernanceRole::Pause,
            GovernanceRole::Schema,
            GovernanceRole::Issuer,
            GovernanceRole::Revocation,
            GovernanceRole::Upgrade,
            GovernanceRole::Recovery,
        ] {
            assert!(client.has_role(&admin, &role));
        }

        let stranger = Address::generate(&env);
        assert!(!client.has_role(&stranger, &GovernanceRole::Pause));
    }

    #[test]
    fn test_upgrader_cannot_grant_itself_control_roles() {
        let (env, admin, _token_admin, _token, client) = setup_test();
        let upgrader = Address::generate(&env);
        let operator = Address::generate(&env);
        client.grant_role(&admin, &upgrader, &GovernanceRole::Upgrade);

        // Operational roles are delegated to upgraders...
        client.grant_role(&upgrader, &operator, &GovernanceRole::Pause);
        assert!(client.has_role(&operator, &GovernanceRole::Pause));

        // ...but Recovery and Upgrade would hand over the contract itself.
        for role in [GovernanceRole::Recovery, GovernanceRole::Upgrade] {
            assert_eq!(
                client
                    .try_grant_role(&upgrader, &upgrader, &role)
                    .unwrap_err()
                    .unwrap(),
                GovernanceError::Unauthorized
            );
        }
        assert_eq!(
            client
                .try_revoke_role(&upgrader, &admin, &GovernanceRole::Recovery)
                .unwrap_err()
                .unwrap(),
            GovernanceError::Unauthorized
        );
        assert!(!client.has_role(&upgrader, &GovernanceRole::Recovery));
    }

    #[test]
    fn test_grant_and_revoke_role() {
        let (env, admin, _token_admin, _token, client) = setup_test();
        let operator = Address::generate(&env);

        // Role management needs admin or upgrade authority.
        assert_eq!(
            client
                .try_grant_role(&operator, &operator, &GovernanceRole::Pause)
                .unwrap_err()
                .unwrap(),
            GovernanceError::Unauthorized
        );

        client.grant_role(&admin, &operator, &GovernanceRole::Pause);
        assert!(client.has_role(&operator, &GovernanceRole::Pause));

        assert_eq!(
            client
                .try_grant_role(&admin, &operator, &GovernanceRole::Pause)
                .unwrap_err()
                .unwrap(),
            GovernanceError::RoleAlreadyAssigned
        );

        client.revoke_role(&admin, &operator, &GovernanceRole::Pause);
        assert!(!client.has_role(&operator, &GovernanceRole::Pause));

        assert_eq!(
            client
                .try_revoke_role(&admin, &operator, &GovernanceRole::Pause)
                .unwrap_err()
                .unwrap(),
            GovernanceError::RoleNotAssigned
        );
    }

    #[test]
    fn test_execute_pause_requires_the_pause_role() {
        let (env, _admin, _token_admin, _token, client) = setup_test();
        let stranger = Address::generate(&env);
        let scope = String::from_str(&env, "Global");

        assert_eq!(
            client
                .try_execute_pause(&stranger, &scope, &None)
                .unwrap_err()
                .unwrap(),
            GovernanceError::Unauthorized
        );
    }

    #[test]
    fn test_pause_history_records_ordered_transitions() {
        let (env, admin, _token_admin, _token, client) = setup_test();
        let global = String::from_str(&env, "Global");
        let registry = String::from_str(&env, "IssuerRegistry");
        let commitment = Some(String::from_str(&env, "incident:42"));

        let first = client.execute_pause(&admin, &global, &commitment);
        let second = client.execute_unpause(&admin, &global);
        let third = client.execute_pause(&admin, &registry, &None);

        assert_eq!(first, 1);
        assert_eq!(second, 2);
        assert_eq!(third, 3);

        let history = client.get_pause_history(&None, &None, &None);
        assert_eq!(history.len(), 3);
        assert_eq!(history.get(0).unwrap().sequence, 1);
        assert!(history.get(0).unwrap().is_paused);
        assert_eq!(history.get(0).unwrap().incident_commitment, commitment);
        assert!(!history.get(1).unwrap().is_paused);
        assert_eq!(history.get(2).unwrap().scope, registry);

        // The scope filter narrows the history to one scope.
        let global_history = client.get_pause_history(&Some(global.clone()), &None, &None);
        assert_eq!(global_history.len(), 2);

        // Bounded queries skip up to `start_after` and cap the row count.
        let after_first = client.get_pause_history(&None, &Some(1), &None);
        assert_eq!(after_first.len(), 2);
        assert_eq!(after_first.get(0).unwrap().sequence, 2);

        let limited = client.get_pause_history(&None, &None, &Some(1));
        assert_eq!(limited.len(), 1);
        assert_eq!(limited.get(0).unwrap().sequence, 1);

        assert!(client.is_paused(&registry));
        assert!(!client.is_paused(&global));
    }

    #[test]
    fn test_global_pause_blocks_proposals_and_votes() {
        let (env, admin, _token_admin, _token, client) = setup_test();
        let global = String::from_str(&env, "Global");
        let proposer = Address::generate(&env);
        let title = String::from_str(&env, "Community Grant");
        let description = String::from_str(&env, "Fund the water project");

        client.execute_pause(&admin, &global, &None);

        assert_eq!(
            client
                .try_create_proposal(&proposer, &title, &description, &vec![&env])
                .unwrap_err()
                .unwrap(),
            GovernanceError::ProtocolPaused
        );

        client.execute_unpause(&admin, &global);

        let proposal_id = client.create_proposal(&proposer, &title, &description, &vec![&env]);
        assert_eq!(proposal_id, 1);
    }

    #[test]
    fn test_admin_transfer_accepted_updates_admin_and_history() {
        let (env, admin, _token_admin, _token, client) = setup_test();
        let successor = Address::generate(&env);

        client.propose_admin_transfer(&admin, &successor);

        // Only one transfer may be in flight at a time.
        assert_eq!(
            client
                .try_propose_admin_transfer(&admin, &Address::generate(&env))
                .unwrap_err()
                .unwrap(),
            GovernanceError::AdminTransferPending
        );

        client.accept_admin_transfer(&successor);
        assert_eq!(client.get_config().admin, successor);

        let history = client.get_admin_transfer_history(&None, &None);
        assert_eq!(history.len(), 1);

        let record = history.get(0).unwrap();
        assert_eq!(record.sequence, 1);
        assert_eq!(record.old_admin, admin);
        assert_eq!(record.proposed_admin, successor);
        assert_eq!(record.actor, successor);
        assert_eq!(record.terminal_reason, String::from_str(&env, "Accepted"));
    }

    #[test]
    fn test_admin_transfer_cancelled_and_expired() {
        let (env, admin, _token_admin, _token, client) = setup_test();
        let successor = Address::generate(&env);

        client.propose_admin_transfer(&admin, &successor);
        client.cancel_admin_transfer(&admin);

        let cancelled = client.get_admin_transfer_history(&None, &None);
        assert_eq!(cancelled.len(), 1);
        assert_eq!(
            cancelled.get(0).unwrap().terminal_reason,
            String::from_str(&env, "Cancelled")
        );

        // A transfer that lapses is swept and recorded as expired.
        client.propose_admin_transfer(&admin, &successor);
        env.ledger()
            .set_timestamp(1_000_000 + ADMIN_TRANSFER_TTL + 1);
        assert!(client.sweep_expired_admin_transfer());
        assert!(!client.sweep_expired_admin_transfer());

        let history = client.get_admin_transfer_history(&None, &None);
        assert_eq!(history.len(), 2);
        assert_eq!(history.get(1).unwrap().sequence, 2);
        assert_eq!(
            history.get(1).unwrap().terminal_reason,
            String::from_str(&env, "Expired")
        );

        // The expired transfer is the only one after the first record.
        let after_first = client.get_admin_transfer_history(&Some(1), &None);
        assert_eq!(after_first.len(), 1);
        assert_eq!(after_first.get(0).unwrap().sequence, 2);
    }

    #[test]
    fn test_expired_admin_transfer_cannot_be_accepted() {
        let (env, admin, _token_admin, _token, client) = setup_test();
        let successor = Address::generate(&env);

        client.propose_admin_transfer(&admin, &successor);
        env.ledger()
            .set_timestamp(1_000_000 + ADMIN_TRANSFER_TTL + 1);

        assert_eq!(
            client
                .try_accept_admin_transfer(&successor)
                .unwrap_err()
                .unwrap(),
            GovernanceError::AdminTransferExpired
        );
        assert_eq!(client.get_config().admin, admin);
    }

    #[test]
    fn test_recover_admin_requires_recovery_role_and_moves_control() {
        let (env, admin, _token_admin, _token, client) = setup_test();
        let rescuer = Address::generate(&env);
        let new_admin = Address::generate(&env);

        assert_eq!(
            client
                .try_recover_admin(&rescuer, &new_admin)
                .unwrap_err()
                .unwrap(),
            GovernanceError::Unauthorized
        );

        client.grant_role(&admin, &rescuer, &GovernanceRole::Recovery);
        client.recover_admin(&rescuer, &new_admin);

        assert_eq!(client.get_config().admin, new_admin);

        // The new admin inherits the role set of the admin it replaces, and
        // the replaced key keeps none of it.
        assert!(client.has_role(&new_admin, &GovernanceRole::Pause));
        assert!(client.has_role(&new_admin, &GovernanceRole::Recovery));
        assert!(!client.has_role(&admin, &GovernanceRole::Pause));
        assert!(!client.has_role(&admin, &GovernanceRole::Recovery));
        assert_eq!(
            client
                .try_recover_admin(&admin, &admin)
                .unwrap_err()
                .unwrap(),
            GovernanceError::Unauthorized
        );

        let history = client.get_admin_transfer_history(&None, &None);
        assert_eq!(history.len(), 1);
        assert_eq!(history.get(0).unwrap().actor, rescuer);
        assert_eq!(
            history.get(0).unwrap().terminal_reason,
            String::from_str(&env, "Accepted")
        );
    }

    #[test]
    fn test_pending_upgrade_approvals_and_expiry_cleanup() {
        let (env, admin, _token_admin, _token, client) = setup_test();
        let approver = Address::generate(&env);
        let proposal_id = String::from_str(&env, "upgrade-1");
        let target_hash = String::from_str(&env, "sha256:abc");
        let version = String::from_str(&env, "1.2.0");

        client.propose_upgrade(&admin, &proposal_id, &target_hash, &version, &3600);

        let pending = client.get_pending_upgrade(&proposal_id).unwrap();
        assert_eq!(pending.approval_count, 0);
        assert_eq!(pending.version, version);
        assert_eq!(
            client
                .get_pending_upgrade_by_hash(&target_hash)
                .unwrap()
                .proposal_id,
            proposal_id
        );

        client.grant_role(&admin, &approver, &GovernanceRole::Upgrade);
        assert_eq!(client.approve_upgrade(&approver, &proposal_id), 1);

        // One approval per account.
        assert_eq!(
            client
                .try_approve_upgrade(&approver, &proposal_id)
                .unwrap_err()
                .unwrap(),
            GovernanceError::UpgradeAlreadyApproved
        );

        assert_eq!(client.approve_upgrade(&admin, &proposal_id), 2);

        // Expired upgrades are swept and stop being returned.
        env.ledger().set_timestamp(1_000_000 + 3601);
        assert_eq!(client.sweep_expired_upgrades(), 1);
        assert!(client.get_pending_upgrade(&proposal_id).is_none());
        assert!(client.get_pending_upgrade_by_hash(&target_hash).is_none());
    }

    #[test]
    fn test_pending_upgrade_query_is_bounded_and_ordered() {
        let (env, admin, _token_admin, _token, client) = setup_test();

        for id in ["a-1", "b-2", "c-3"] {
            client.propose_upgrade(
                &admin,
                &String::from_str(&env, id),
                &String::from_str(&env, id),
                &String::from_str(&env, "1.0.0"),
                &3600,
            );
        }

        let all = client.get_pending_upgrades(&None, &None);
        assert_eq!(all.len(), 3);
        assert_eq!(
            all.get(0).unwrap().proposal_id,
            String::from_str(&env, "a-1")
        );

        let after = client.get_pending_upgrades(&Some(String::from_str(&env, "a-1")), &None);
        assert_eq!(after.len(), 2);
        assert_eq!(
            after.get(0).unwrap().proposal_id,
            String::from_str(&env, "b-2")
        );

        let limited = client.get_pending_upgrades(&None, &Some(2));
        assert_eq!(limited.len(), 2);
    }
}
