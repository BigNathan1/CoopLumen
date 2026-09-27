#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, String, Vec,
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

/// Contract storage keys.
#[contracttype]
pub enum DataKey {
    Config,
    Proposal(u64),
    Vote(u64, Address),
    ProposalCount,
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
    ) -> Result<(), GovernanceError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(GovernanceError::AlreadyInitialized);
        }
        if voting_period == 0 || quorum_bps > 10_000 {
            return Err(GovernanceError::InvalidInput);
        }

        let config = Config {
            admin,
            governance_token,
            voting_period,
            quorum_bps,
        };
        env.storage().instance().set(&DataKey::Config, &config);
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

        if env
            .storage()
            .instance()
            .has(&DataKey::Vote(proposal_id, voter.clone()))
        {
            return Err(GovernanceError::AlreadyVoted);
        }

        let token_client = token::Client::new(&env, &config.governance_token);
        let weight = token_client.balance(&voter);
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
        env.storage()
            .instance()
            .set(&DataKey::Proposal(proposal_id), &proposal);

        Ok(())
    }

    /// Get current governance configuration.
    pub fn get_config(env: Env) -> Result<Config, GovernanceError> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(GovernanceError::NotInitialized)
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

        client.initialize(&admin, &token, &86400, &5000);

        (env, admin, token_admin, token, client)
    }

    #[test]
    fn test_initialize_and_get_config() {
        let (_env, admin, _token_admin, token, client) = setup_test();
        let config = client.get_config();
        assert_eq!(config.admin, admin);
        assert_eq!(config.governance_token, token);
        assert_eq!(config.voting_period, 86400);
        assert_eq!(config.quorum_bps, 5000);
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
}
