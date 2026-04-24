import 'dotenv/config';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ISSUER_1 = 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTG';
const ISSUER_2 = 'GBVNNPOFVV2LABZUDNST67P5YQZAHPQ3WKSBZEKFGIYNQKU32RBTOSX';
const MEMBERS = [
  'GDQOE23CFSUMSVQK4Y5JHPPYK73VYCNHZHA7ENKCV37P6SUEO6XQBKPP',
  'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7',
  'GBHWKBPP3O4H2BUUKSFXE4PK5WHLQYVZIZUNUJ4AU5VATCHX3B7A3OGR',
  'GD6SJQJOPJYunderneath5NOTAREALKEYJUSTPADDING56CHARLONG',
  'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGBCB9T6CTGUMZQMKL',
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
