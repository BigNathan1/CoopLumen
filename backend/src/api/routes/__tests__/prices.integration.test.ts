/**
 * Integration test: verifies fetching live XLM price from public source.
 * Gracefully handles offline environments.
 */

import request from 'supertest';
import app from '../../../app';

describe('Prices live public integration', () => {
  it('fetches real XLM/USD price from public market data feed', async () => {
    const response = await request(app).get('/api/v1/prices/xlm');

    // If network is available, status is 200; if network is blocked in sandbox, status is 502
    if (response.status === 200) {
      expect(response.body.data).toBeDefined();
      expect(response.body.data.asset).toBe('XLM');
      expect(response.body.data.currency).toBe('USD');
      expect(typeof response.body.data.price).toBe('string');
      expect(Number(response.body.data.price)).toBeGreaterThan(0);
      expect(typeof response.body.data.source).toBe('string');
    } else {
      expect(response.status).toBe(502);
      expect(response.body.error).toBe('Failed to fetch price from public source.');
    }
  });
});
