use cooplumen_governance::{
    GovernanceContract, GovernanceContractClient, GovernanceError, ProposalStatus, VoteChoice,
};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{vec, Address, Env, String};

const START_TIME: u64 = 1_000_000;
const VOTING_PERIOD: u64 = 60;

fn configured_contract() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(START_TIME);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();
    let contract = env.register(GovernanceContract, ());

    GovernanceContractClient::new(&env, &contract).initialize(
        &admin,
        &token,
        &VOTING_PERIOD,
        &5_000,
        &1_000,
    );

    (env, token, contract)
}

#[test]
fn proposal_vote_execute_flow_persists_every_transition() {
    let (env, token, contract) = configured_contract();
    let client = GovernanceContractClient::new(&env, &contract);
    let token_admin = StellarAssetClient::new(&env, &token);
    let proposer = Address::generate(&env);
    let voter_for = Address::generate(&env);
    let voter_against = Address::generate(&env);
    let executor = Address::generate(&env);

    token_admin.mint(&voter_for, &600);
    token_admin.mint(&voter_against, &100);

    let proposal_id = client.create_proposal(
        &proposer,
        &String::from_str(&env, "Fund the community clinic"),
        &String::from_str(&env, "Release the approved grant in one payment"),
        &vec![&env, String::from_str(&env, "disburse_treasury:500")],
    );

    let created = client.get_proposal(&proposal_id);
    assert_eq!(created.status, ProposalStatus::Active);
    assert_eq!(created.votes_for, 0);
    assert_eq!(created.votes_against, 0);

    client.cast_vote(&proposal_id, &VoteChoice::For, &voter_for);
    client.cast_vote(&proposal_id, &VoteChoice::Against, &voter_against);

    let voted = client.get_proposal(&proposal_id);
    assert_eq!(voted.votes_for, 600);
    assert_eq!(voted.votes_against, 100);
    assert_eq!(client.get_vote(&proposal_id, &voter_for).weight, 600);
    assert_eq!(
        client.get_vote(&proposal_id, &voter_against).choice,
        VoteChoice::Against
    );

    env.ledger().set_timestamp(START_TIME + VOTING_PERIOD + 1);
    assert_eq!(
        client.finalize_proposal(&proposal_id),
        ProposalStatus::Passed
    );

    client.execute_proposal(&proposal_id, &executor);
    assert_eq!(
        client.get_proposal(&proposal_id).status,
        ProposalStatus::Executed
    );
}

#[test]
fn passed_proposal_below_quorum_cannot_execute() {
    let (env, token, contract) = configured_contract();
    let client = GovernanceContractClient::new(&env, &contract);
    let voter = Address::generate(&env);
    let executor = Address::generate(&env);

    StellarAssetClient::new(&env, &token).mint(&voter, &400);

    let proposal_id = client.create_proposal(
        &Address::generate(&env),
        &String::from_str(&env, "Small grant"),
        &String::from_str(&env, "This ballot passes but lacks participation"),
        &vec![&env, String::from_str(&env, "disburse_treasury:50")],
    );
    client.cast_vote(&proposal_id, &VoteChoice::For, &voter);

    env.ledger().set_timestamp(START_TIME + VOTING_PERIOD + 1);
    assert_eq!(
        client.finalize_proposal(&proposal_id),
        ProposalStatus::Passed
    );

    let error = client
        .try_execute_proposal(&proposal_id, &executor)
        .unwrap_err()
        .unwrap();
    assert_eq!(error, GovernanceError::InsufficientQuorum);
    assert_eq!(
        client.get_proposal(&proposal_id).status,
        ProposalStatus::Passed
    );
}

#[test]
fn rejected_proposal_cannot_execute() {
    let (env, token, contract) = configured_contract();
    let client = GovernanceContractClient::new(&env, &contract);
    let voter_for = Address::generate(&env);
    let voter_against = Address::generate(&env);
    let executor = Address::generate(&env);

    let token_admin = StellarAssetClient::new(&env, &token);
    token_admin.mint(&voter_for, &200);
    token_admin.mint(&voter_against, &600);

    let proposal_id = client.create_proposal(
        &Address::generate(&env),
        &String::from_str(&env, "Controversial proposal"),
        &String::from_str(&env, "This proposal receives majority against votes"),
        &vec![&env, String::from_str(&env, "action:noop")],
    );

    client.cast_vote(&proposal_id, &VoteChoice::For, &voter_for);
    client.cast_vote(&proposal_id, &VoteChoice::Against, &voter_against);

    env.ledger().set_timestamp(START_TIME + VOTING_PERIOD + 1);
    assert_eq!(
        client.finalize_proposal(&proposal_id),
        ProposalStatus::Rejected
    );

    let error = client
        .try_execute_proposal(&proposal_id, &executor)
        .unwrap_err()
        .unwrap();
    assert_eq!(error, GovernanceError::ProposalExecutionFailed);
    assert_eq!(
        client.get_proposal(&proposal_id).status,
        ProposalStatus::Rejected
    );
}

#[test]
fn delegation_and_undelegation_lifecycle() {
    let (env, token, contract) = configured_contract();
    let client = GovernanceContractClient::new(&env, &contract);
    let delegator = Address::generate(&env);
    let delegatee = Address::generate(&env);
    let token_admin = StellarAssetClient::new(&env, &token);

    token_admin.mint(&delegator, &300);
    token_admin.mint(&delegatee, &200);

    // Initial delegation
    client.delegate(&delegator, &delegatee);
    assert_eq!(client.get_delegation(&delegator), Some(delegatee.clone()));
    assert_eq!(client.get_delegators(&delegatee), vec![&env, delegator.clone()]);

    // Delegator revokes delegation
    client.undelegate(&delegator);
    assert_eq!(client.get_delegation(&delegator), None);
    assert_eq!(client.get_delegators(&delegatee).len(), 0);

    // Re-delegation works cleanly
    client.delegate(&delegator, &delegatee);
    assert_eq!(client.get_delegation(&delegator), Some(delegatee.clone()));
    assert_eq!(client.get_delegators(&delegatee), vec![&env, delegator.clone()]);
}

#[test]
fn proposal_creation_and_initialization_input_validation() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(START_TIME);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();
    let contract = env.register(GovernanceContract, ());
    let client = GovernanceContractClient::new(&env, &contract);

    // Invalid zero voting period rejected
    let err_period = client
        .try_initialize(&admin, &token, &0, &5_000, &1_000)
        .unwrap_err()
        .unwrap();
    assert_eq!(err_period, GovernanceError::InvalidInput);

    // Invalid quorum bps > 10000 rejected
    let err_quorum = client
        .try_initialize(&admin, &token, &VOTING_PERIOD, &10_001, &1_000)
        .unwrap_err()
        .unwrap();
    assert_eq!(err_quorum, GovernanceError::InvalidInput);

    // Invalid non-positive total supply rejected
    let err_supply = client
        .try_initialize(&admin, &token, &VOTING_PERIOD, &5_000, &0)
        .unwrap_err()
        .unwrap();
    assert_eq!(err_supply, GovernanceError::InvalidInput);

    // Successful initialization
    client.initialize(&admin, &token, &VOTING_PERIOD, &5_000, &1_000);

    // Re-initialization rejected
    let err_reinit = client
        .try_initialize(&admin, &token, &VOTING_PERIOD, &5_000, &1_000)
        .unwrap_err()
        .unwrap();
    assert_eq!(err_reinit, GovernanceError::AlreadyInitialized);

    // Proposal creation with empty title rejected
    let err_title = client
        .try_create_proposal(
            &Address::generate(&env),
            &String::from_str(&env, ""),
            &String::from_str(&env, "Non-empty description"),
            &vec![&env],
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err_title, GovernanceError::InvalidInput);
}
