import { PoolClient } from 'pg';

export interface SeedCommunityFixture {
  name: string;
  description: string;
  issuerPublicKey: string;
  assetCode: string;
  assetIssuer: string;
  settings: {
    loanLimit: number;
    quorum: number;
    votingPeriodDays: number;
  };
  members: Array<{
    address: string;
    role: 'admin' | 'treasurer' | 'member';
  }>;
}

export interface SeededCommunityRecord {
  id: string;
  name: string;
  asset_code: string;
  asset_issuer: string;
  issuer_public_key: string;
}

export interface SeededDatabase {
  eco: SeededCommunityRecord;
  agri: SeededCommunityRecord;
}

export const TEST_SEED_FIXTURES: SeedCommunityFixture[] = [
  {
    name: 'EcoDAO',
    description: 'A community token for local environmental initiatives',
    issuerPublicKey: 'GDMZRAGTOJHQK3LN3D2EDLEAMS76EDIQEMWCUTYIYHUE5HFPLPGBCGUS',
    assetCode: 'ECO',
    assetIssuer: 'GDMZRAGTOJHQK3LN3D2EDLEAMS76EDIQEMWCUTYIYHUE5HFPLPGBCGUS',
    settings: {
      loanLimit: 500,
      quorum: 0.6,
      votingPeriodDays: 7,
    },
    members: [
      { address: 'GDPOXKXG35WBW7C5FMTHB5PSJOLLTRWFGP4JHQQMNF4UT2VRH6HC2KRZ', role: 'admin' },
      {
        address: 'GA2TDRPYGRQ5LXX3HPO6FHESSV6KZJKC72N6QZI77NE5NXG4VQXTA5C2',
        role: 'treasurer',
      },
      { address: 'GC2H4OVKUNLVGU7AG625OG6HMFYU7KVUNN7O367QV4X43AEFJ7XOO32Q', role: 'member' },
      { address: 'GCZU7VEN33HVIHPS2ZR3VWI5FZXOMWBZFBFOON53WRKDGXGIXNHLY43J', role: 'member' },
    ],
  },
  {
    name: 'AgriCoop',
    description: 'A cooperative for smallholder farmers',
    issuerPublicKey: 'GB24DH7I4KCJ7ABONGAOGWWNQBHBVXWNBMZXOBZRSL7ZMJGMP5VZV6P6',
    assetCode: 'AGRI',
    assetIssuer: 'GB24DH7I4KCJ7ABONGAOGWWNQBHBVXWNBMZXOBZRSL7ZMJGMP5VZV6P6',
    settings: {
      loanLimit: 1000,
      quorum: 0.51,
      votingPeriodDays: 5,
    },
    members: [
      { address: 'GC2H4OVKUNLVGU7AG625OG6HMFYU7KVUNN7O367QV4X43AEFJ7XOO32Q', role: 'admin' },
      {
        address: 'GCZU7VEN33HVIHPS2ZR3VWI5FZXOMWBZFBFOON53WRKDGXGIXNHLY43J',
        role: 'treasurer',
      },
      { address: 'GBQYZ6AJY3VCXTS4L4YHFXGGGNYKF3DHTBJWUISSTOCW5H3Z7PUVUCH3', role: 'member' },
    ],
  },
];

async function upsertCommunity(
  client: PoolClient,
  fixture: SeedCommunityFixture
): Promise<SeededCommunityRecord> {
  const result = await client.query<SeededCommunityRecord>(
    `INSERT INTO communities (name, description, issuer_public_key, asset_code, asset_issuer)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (name) DO UPDATE
     SET description = EXCLUDED.description,
         issuer_public_key = EXCLUDED.issuer_public_key,
         asset_code = EXCLUDED.asset_code,
         asset_issuer = EXCLUDED.asset_issuer
     RETURNING id, name, asset_code, asset_issuer, issuer_public_key`,
    [
      fixture.name,
      fixture.description,
      fixture.issuerPublicKey,
      fixture.assetCode,
      fixture.assetIssuer,
    ]
  );

  return result.rows[0];
}

export async function seedBaselineData(client: PoolClient): Promise<SeededDatabase> {
  const [ecoFixture, agriFixture] = TEST_SEED_FIXTURES;
  const eco = await upsertCommunity(client, ecoFixture);
  const agri = await upsertCommunity(client, agriFixture);

  await Promise.all(
    [
      ...ecoFixture.members.map((member) => ({ communityId: eco.id, ...member })),
      ...agriFixture.members.map((member) => ({ communityId: agri.id, ...member })),
    ].map(({ communityId, address, role }) =>
      client.query(
        `INSERT INTO members (community_id, stellar_address, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (community_id, stellar_address) DO UPDATE
         SET role = EXCLUDED.role`,
        [communityId, address, role]
      )
    )
  );

  await client.query(
    `INSERT INTO community_settings (community_id, settings)
     VALUES ($1, $2), ($3, $4)
     ON CONFLICT (community_id) DO UPDATE
     SET settings = EXCLUDED.settings`,
    [
      eco.id,
      JSON.stringify(ecoFixture.settings),
      agri.id,
      JSON.stringify(agriFixture.settings),
    ]
  );

  return { eco, agri };
}
