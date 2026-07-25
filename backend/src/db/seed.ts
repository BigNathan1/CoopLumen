import 'dotenv/config';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Randomly generated testnet public keys. They must be well-formed 56-character
// StrKey addresses — the `communities` CHECK constraints reject anything else.
const ISSUER_1 = 'GDMZRAGTOJHQK3LN3D2EDLEAMS76EDIQEMWCUTYIYHUE5HFPLPGBCGUS';
const ISSUER_2 = 'GB24DH7I4KCJ7ABONGAOGWWNQBHBVXWNBMZXOBZRSL7ZMJGMP5VZV6P6';
const MEMBERS = [
  'GDPOXKXG35WBW7C5FMTHB5PSJOLLTRWFGP4JHQQMNF4UT2VRH6HC2KRZ',
  'GA2TDRPYGRQ5LXX3HPO6FHESSV6KZJKC72N6QZI77NE5NXG4VQXTA5C2',
  'GC2H4OVKUNLVGU7AG625OG6HMFYU7KVUNN7O367QV4X43AEFJ7XOO32Q',
  'GCZU7VEN33HVIHPS2ZR3VWI5FZXOMWBZFBFOON53WRKDGXGIXNHLY43J',
  'GBQYZ6AJY3VCXTS4L4YHFXGGGNYKF3DHTBJWUISSTOCW5H3Z7PUVUCH3',
];

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    logger.info('Seeding development database...');

    // Communities
    const [eco] = (
      await client.query<{ id: string }>(
        `INSERT INTO communities (name, description, issuer_public_key, asset_code, asset_issuer)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
         RETURNING id`,
        [
          'EcoDAO',
          'A community token for local environmental initiatives',
          ISSUER_1,
          'ECO',
          ISSUER_1,
        ]
      )
    ).rows;

    const [agri] = (
      await client.query<{ id: string }>(
        `INSERT INTO communities (name, description, issuer_public_key, asset_code, asset_issuer)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
         RETURNING id`,
        ['AgriCoop', 'A cooperative for smallholder farmers', ISSUER_2, 'AGRI', ISSUER_2]
      )
    ).rows;

    logger.info('Communities seeded', { ecoId: eco.id, agriId: agri.id });

    // Members — first 3 join EcoDAO, last 2 join AgriCoop, middle one joins both
    const memberInserts = [
      [eco.id, MEMBERS[0], 'admin'],
      [eco.id, MEMBERS[1], 'treasurer'],
      [eco.id, MEMBERS[2], 'member'],
      [eco.id, MEMBERS[3], 'member'],
      [agri.id, MEMBERS[2], 'admin'],
      [agri.id, MEMBERS[3], 'treasurer'],
      [agri.id, MEMBERS[4], 'member'],
    ];

    for (const [communityId, address, role] of memberInserts) {
      await client.query(
        `INSERT INTO members (community_id, stellar_address, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (community_id, stellar_address) DO UPDATE SET role = EXCLUDED.role`,
        [communityId, address, role]
      );
    }

    logger.info('Members seeded', { count: memberInserts.length });

    // Community settings
    await client.query(
      `INSERT INTO community_settings (community_id, settings)
       VALUES ($1, $2), ($3, $4)
       ON CONFLICT (community_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [
        eco.id,
        JSON.stringify({ loanLimit: 500, quorum: 0.6, votingPeriodDays: 7 }),
        agri.id,
        JSON.stringify({ loanLimit: 1000, quorum: 0.51, votingPeriodDays: 5 }),
      ]
    );

    logger.info('Community settings seeded');
    logger.info('Seed complete');
  } catch (error) {
    logger.error('Seed failed', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  logger.error('Seed runner failed', error);
  process.exitCode = 1;
});
