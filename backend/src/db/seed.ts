import 'dotenv/config';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

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
  'GDQOE23CFSUMSVQK4Y5JHPPYK73VYCNHZHA7ENKCV37P6SUEO6XQBKPP',
  'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7',
  'GBHWKBPP3O4H2BUUKSFXE4PK5WHLQYVZIZUNUJ4AU5VATCHX3B7A3OGR',
  'GASJ7BO2RARCPXOLTSDCD36ZYT75FGINHQ7S3FOSAZYFZFIM3YDRUJIJ',
  'GBK5QKMKFFE4OJDAGYWNMV746HCRBSEJH57I2UMWPJGA5BUMSZIAQAAO',
];

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
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
      { communityId: eco.id, address: MEMBERS[0], role: 'admin' },
      { communityId: eco.id, address: MEMBERS[1], role: 'treasurer' },
      { communityId: eco.id, address: MEMBERS[2], role: 'member' },
      { communityId: eco.id, address: MEMBERS[3], role: 'member' },
      { communityId: agri.id, address: MEMBERS[2], role: 'admin' },
      { communityId: agri.id, address: MEMBERS[3], role: 'treasurer' },
      { communityId: agri.id, address: MEMBERS[4], role: 'member' },
    ];

    await Promise.all(
      memberInserts.map(({ communityId, address, role }) =>
        client.query(
          `INSERT INTO members (community_id, stellar_address, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (community_id, stellar_address) DO UPDATE SET role = EXCLUDED.role`,
          [communityId, address, role]
        )
      )
    );

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
  } catch (error) {
    logger.error('Seed failed', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    logger.info('Database connection closed.');
  }
}

if (require.main === module) {
  logger.info('Seeding development database...');
  main()
    .then(() => logger.info('Seed complete'))
    .catch((error) => {
      logger.error('Seed runner failed', error);
      process.exitCode = 1;
    });
}
