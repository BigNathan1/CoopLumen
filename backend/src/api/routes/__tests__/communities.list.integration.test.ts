/**
 * Integration tests for GET /api/v1/communities
 * Tests pagination, search, and sort functionality
 */

import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { Pool } from 'pg';
import app from '../../../app';
import { db } from '../../../db';
import { makeTestPool, seedTestDatabase, truncateAll } from '../../../testing/fixtures';
import { createSessionToken } from '../../utils/sessionToken';

const RUN = Boolean(process.env.DATABASE_URL);
const describeIf = RUN ? describe : describe.skip;

function authHeader(address: string): string {
  return `Bearer ${createSessionToken(address).token}`;
}

describeIf('GET /api/v1/communities (pagination, search, sort)', () => {
  let pool: Pool;
  const issuer1 = Keypair.random().publicKey();
  const issuer2 = Keypair.random().publicKey();
  const issuer3 = Keypair.random().publicKey();
  const communityIds: string[] = [];

  beforeAll(async () => {
    pool = makeTestPool();
    const client = await pool.connect();
    try {
      await seedTestDatabase(client);

      // Create multiple communities for pagination/search/sort testing
      const communities = [
        {
          name: 'Alpha Community',
          description: 'First test community for searching',
          issuer: issuer1,
          code: 'ALPH',
        },
        {
          name: 'Beta DAO',
          description: 'Second test community with different name',
          issuer: issuer2,
          code: 'BETA',
        },
        {
          name: 'Gamma Network',
          description: 'Third community for pagination tests',
          issuer: issuer3,
          code: 'GAMA',
        },
        {
          name: 'Delta Community',
          description: 'Fourth community also for searching',
          issuer: issuer1,
          code: 'DELT',
        },
      ];

      for (const c of communities) {
        const res = await request(app)
          .post('/api/v1/communities')
          .set('Authorization', authHeader(c.issuer))
          .send({
            name: c.name,
            description: c.description,
            issuerPublicKey: c.issuer,
            assetCode: c.code,
            assetIssuer: c.issuer,
          });
        communityIds.push(res.body.data.id);
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await truncateAll(client);
    } finally {
      client.release();
    }
    await pool.end();
    await db.end();
  });

  describe('Pagination', () => {
    it('returns paginated results with default limit', async () => {
      const res = await request(app).get('/api/v1/communities');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('page');
      expect(res.body.meta).toHaveProperty('limit');
      expect(res.body.meta).toHaveProperty('pages');
      expect(res.body.meta.total).toBeGreaterThanOrEqual(4);
    });

    it('respects custom page size via limit parameter', async () => {
      const res = await request(app).get('/api/v1/communities?limit=2');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.meta.limit).toBe(2);
    });

    it('returns second page when page=2', async () => {
      const page1 = await request(app).get('/api/v1/communities?limit=2&page=1');
      const page2 = await request(app).get('/api/v1/communities?limit=2&page=2');

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      expect(page1.body.data[0].id).not.toBe(page2.body.data[0].id);
      expect(page2.body.meta.page).toBe(2);
    });

    it('handles offset parameter correctly', async () => {
      const withPage = await request(app).get('/api/v1/communities?limit=2&page=2');
      const withOffset = await request(app).get('/api/v1/communities?limit=2&offset=2');

      expect(withPage.status).toBe(200);
      expect(withOffset.status).toBe(200);
      expect(withPage.body.data[0].id).toBe(withOffset.body.data[0].id);
    });

    it('calculates pages correctly in pagination meta', async () => {
      const res = await request(app).get('/api/v1/communities?limit=2');
      expect(res.status).toBe(200);
      expect(res.body.meta.pages).toBe(Math.ceil(res.body.meta.total / 2));
    });
  });

  describe('Search', () => {
    it('finds communities by name using search parameter', async () => {
      const res = await request(app).get('/api/v1/communities?search=Alpha');
      expect(res.status).toBe(200);
      expect(res.body.data.some((c: { name: string }) => c.name === 'Alpha Community')).toBe(true);
    });

    it('finds communities by description using search parameter', async () => {
      const res = await request(app).get('/api/v1/communities?search=searching');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data.some((c: { name: string }) => c.name === 'Alpha Community')).toBe(true);
      expect(res.body.data.some((c: { name: string }) => c.name === 'Delta Community')).toBe(true);
    });

    it('returns empty array when search matches no communities', async () => {
      const res = await request(app).get('/api/v1/communities?search=NonExistentCommunity12345');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });

    it('performs case-insensitive search', async () => {
      const lower = await request(app).get('/api/v1/communities?search=beta');
      const upper = await request(app).get('/api/v1/communities?search=BETA');

      expect(lower.status).toBe(200);
      expect(upper.status).toBe(200);
      expect(lower.body.data.length).toBe(upper.body.data.length);
      expect(lower.body.data.some((c: { name: string }) => c.name === 'Beta DAO')).toBe(true);
    });

    it('combines search with pagination', async () => {
      const res = await request(app).get('/api/v1/communities?search=community&limit=1');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.meta.limit).toBe(1);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Sort', () => {
    it('sorts by created_at descending by default', async () => {
      const res = await request(app).get('/api/v1/communities?limit=10');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(1);

      // Most recent should be first by default
      const dates = res.body.data.map((c: { created_at: string }) => new Date(c.created_at));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1].getTime()).toBeGreaterThanOrEqual(dates[i].getTime());
      }
    });

    it('sorts by created_at ascending when order=asc', async () => {
      const res = await request(app).get(
        '/api/v1/communities?sortBy=created_at&order=asc&limit=10'
      );
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(1);

      const dates = res.body.data.map((c: { created_at: string }) => new Date(c.created_at));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1].getTime()).toBeLessThanOrEqual(dates[i].getTime());
      }
    });

    it('sorts by name ascending', async () => {
      const res = await request(app).get('/api/v1/communities?sortBy=name&order=asc&limit=10');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(1);

      const names = res.body.data.map((c: { name: string }) => c.name);
      for (let i = 1; i < names.length; i++) {
        expect(names[i - 1].localeCompare(names[i])).toBeLessThanOrEqual(0);
      }
    });

    it('sorts by name descending', async () => {
      const res = await request(app).get('/api/v1/communities?sortBy=name&order=desc&limit=10');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(1);

      const names = res.body.data.map((c: { name: string }) => c.name);
      for (let i = 1; i < names.length; i++) {
        expect(names[i - 1].localeCompare(names[i])).toBeGreaterThanOrEqual(0);
      }
    });

    it('sorts by updated_at descending', async () => {
      const res = await request(app).get(
        '/api/v1/communities?sortBy=updated_at&order=desc&limit=10'
      );
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(1);

      const dates = res.body.data.map((c: { updated_at: string }) => new Date(c.updated_at));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1].getTime()).toBeGreaterThanOrEqual(dates[i].getTime());
      }
    });

    it('combines sort with search', async () => {
      const res = await request(app).get(
        '/api/v1/communities?search=community&sortBy=name&order=asc'
      );
      expect(res.status).toBe(200);

      const names = res.body.data.map((c: { name: string }) => c.name);
      for (let i = 1; i < names.length; i++) {
        expect(names[i - 1].localeCompare(names[i])).toBeLessThanOrEqual(0);
      }
    });

    it('combines sort with pagination', async () => {
      const res = await request(app).get(
        '/api/v1/communities?sortBy=name&order=asc&limit=2&page=1'
      );
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.meta.page).toBe(1);
    });
  });

  describe('Combined functionality', () => {
    it('handles pagination, search, and sort all together', async () => {
      const res = await request(app).get(
        '/api/v1/communities?search=community&sortBy=name&order=asc&limit=2&page=1'
      );
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.meta.limit).toBe(2);
      expect(res.body.meta.page).toBe(1);

      // Verify sorting is applied
      if (res.body.data.length > 1) {
        const names = res.body.data.map((c: { name: string }) => c.name);
        expect(names[0].localeCompare(names[1])).toBeLessThanOrEqual(0);
      }
    });
  });

  describe('Edge cases', () => {
    it('handles limit exceeding total records', async () => {
      // 100 is the documented maximum page size; larger values are rejected.
      const res = await request(app).get('/api/v1/communities?limit=100');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(res.body.meta.total);
    });

    it('handles page beyond available pages', async () => {
      const res = await request(app).get('/api/v1/communities?limit=10&page=9999');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('excludes soft-deleted communities from results', async () => {
      // Soft delete one community
      await request(app)
        .delete(`/api/v1/communities/${communityIds[0]}`)
        .set('Authorization', authHeader(issuer1));

      const res = await request(app).get('/api/v1/communities?limit=100');
      expect(res.status).toBe(200);
      expect(res.body.data.some((c: { id: string }) => c.id === communityIds[0])).toBe(false);
    });
  });
});
