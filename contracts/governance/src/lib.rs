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
    pub fn get_proposal(env: Env, proposal_id: u64) -> Result<Proposal, GovernanceError> {
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
}
