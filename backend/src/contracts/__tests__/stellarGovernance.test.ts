import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  StellarService,
  StellarNetworkError,
  executeProposalOnChain,
  fetchProposalTally,
  fetchProposalsForCommunity,
  submitVoteTransaction,
} from '../stellar';

type PrivateStellar = {
  simulateContractRead: (method: string, args: unknown[]) => Promise<unknown>;
};

function privateService(): PrivateStellar {
  return StellarService as unknown as PrivateStellar;
}

function signedEnvelope(): string {
  const keypair = Keypair.random();
  const account = new Account(keypair.publicKey(), '1');
  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: StellarService.getNetworkPassphrase(),
  })
    .addOperation(
      Operation.payment({
        destination: Keypair.random().publicKey(),
        asset: Asset.native(),
        amount: '1',
      })
    )
    .setTimeout(30)
    .build();

  return transaction.toXDR();
}

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GOVERNANCE_CONTRACT_ID;
  delete process.env.GOVERNANCE_SIGNER_SECRET;
});

describe('governance contract reads', () => {
  it('returns an empty list when the contract result is not an array', async () => {
    jest.spyOn(privateService(), 'simulateContractRead').mockResolvedValue(null);

    await expect(fetchProposalsForCommunity('community-1')).resolves.toEqual([]);
  });

  it('decodes snake_case, camelCase and loose scalar values', async () => {
    jest.spyOn(privateService(), 'simulateContractRead').mockResolvedValue([
      {
        id: 'proposal-1',
        community_id: 'community-1',
        title: 'Fund the clinic',
        description: undefined,
        proposer: 'GABC',
        status: 'active',
        created_at: 123,
        voting_ends_at: '456',
        votes_for: 10,
        votes_against: true,
        votes_abstain: { not: 'a scalar' },
      },
      {
        proposalId: 'proposal-2',
        communityId: 'community-2',
        title: 42n,
        proposer: null,
        state: 'passed',
        createdAt: 'not-a-number',
      },
    ]);

    const proposals = await fetchProposalsForCommunity('community-1');

    expect(proposals).toHaveLength(2);
    expect(proposals[0]).toMatchObject({
      id: 'proposal-1',
      communityId: 'community-1',
      title: 'Fund the clinic',
      description: '0',
      proposer: 'GABC',
      createdAt: 123,
      votingEndsAt: 456,
      votesFor: '10',
      votesAgainst: 'true',
    });
    expect(proposals[0].votesAbstain).toBe(JSON.stringify({ not: 'a scalar' }));
    expect(proposals[1]).toMatchObject({
      id: 'proposal-2',
      title: '42',
      proposer: '0',
      status: 'passed',
      createdAt: 0,
      votingEndsAt: 0,
      votesFor: '0',
    });
  });

  it('returns null when the contract has no such proposal', async () => {
    jest.spyOn(privateService(), 'simulateContractRead').mockResolvedValue(null);

    await expect(fetchProposalTally('proposal-1')).resolves.toBeNull();
  });

  it('decodes a single proposal', async () => {
    jest.spyOn(privateService(), 'simulateContractRead').mockResolvedValue({
      id: 'proposal-1',
      communityId: 'community-1',
      title: 'Fund the clinic',
    });

    await expect(fetchProposalTally('proposal-1')).resolves.toMatchObject({
      id: 'proposal-1',
      communityId: 'community-1',
    });
  });

  it('requires a configured governance contract id', async () => {
    delete process.env.GOVERNANCE_CONTRACT_ID;

    await expect(
      (
        StellarService as unknown as {
          simulateContractRead: (method: string, args: unknown[]) => Promise<unknown>;
        }
      ).simulateContractRead('get_proposals', [])
    ).rejects.toThrow(/GOVERNANCE_CONTRACT_ID/);
  });
});

describe('submitVoteTransaction', () => {
  it('rejects an envelope that is not a signed transaction', async () => {
    await expect(submitVoteTransaction({ signedXdr: 'not-an-envelope' })).rejects.toBeInstanceOf(
      StellarNetworkError
    );
  });

  it('reports a Soroban error response without details', async () => {
    const server = StellarService.getSorobanServer();
    jest
      .spyOn(server, 'sendTransaction')
      .mockResolvedValue({ status: 'ERROR', hash: 'h1' } as never);

    await expect(submitVoteTransaction({ signedXdr: signedEnvelope() })).rejects.toThrow(
      /rejected vote transaction/
    );
  });

  it('reports the error result when Soroban includes one', async () => {
    const server = StellarService.getSorobanServer();
    jest.spyOn(server, 'sendTransaction').mockResolvedValue({
      status: 'ERROR',
      hash: 'h1',
      errorResult: { toXDR: () => 'error-xdr' },
    } as never);

    await expect(submitVoteTransaction({ signedXdr: signedEnvelope() })).rejects.toThrow(
      /error-xdr/
    );
  });

  it('wraps transport failures', async () => {
    const server = StellarService.getSorobanServer();
    jest.spyOn(server, 'sendTransaction').mockRejectedValue(new Error('socket closed'));

    await expect(submitVoteTransaction({ signedXdr: signedEnvelope() })).rejects.toThrow(
      /socket closed/
    );
  });

  it('returns the hash and status for an accepted transaction', async () => {
    const server = StellarService.getSorobanServer();
    jest
      .spyOn(server, 'sendTransaction')
      .mockResolvedValue({ status: 'PENDING', hash: 'hash-1' } as never);

    await expect(submitVoteTransaction({ signedXdr: signedEnvelope() })).resolves.toEqual({
      hash: 'hash-1',
      status: 'PENDING',
    });
  });
});

describe('executeProposalOnChain', () => {
  it('requires the governance contract id', async () => {
    await expect(
      executeProposalOnChain({
        proposalId: 'p1',
        communityId: 'c1',
        proposerAddress: 'GABC',
      })
    ).rejects.toThrow(/GOVERNANCE_CONTRACT_ID/);
  });

  it('requires the governance signer secret', async () => {
    process.env.GOVERNANCE_CONTRACT_ID = Keypair.random().publicKey();

    await expect(
      executeProposalOnChain({
        proposalId: 'p1',
        communityId: 'c1',
        proposerAddress: 'GABC',
      })
    ).rejects.toThrow(/GOVERNANCE_SIGNER_SECRET/);
  });
});
