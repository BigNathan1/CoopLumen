import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { apiRouter } from './api/routes';
import { errorHandler } from './api/middleware/errorHandler';
import { notFound } from './api/middleware/notFound';
import { requestLogger } from './api/middleware/requestLogger';
import { db } from './db';
import { StellarService } from './contracts/stellar';
import { pageMeta, parsePagination, queryString } from './api/utils/http';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' }));
app.use(express.json());
app.use(requestLogger);

const healthHandler = (_req: Request, res: Response, next: NextFunction): void => {
  Promise.allSettled([db.ping(), StellarService.ping()])
    .then(([dbResult, stellarResult]) => {
      const dbOk = dbResult.status === 'fulfilled' && dbResult.value;
      const stellarOk = stellarResult.status === 'fulfilled' && stellarResult.value;
      res.status(dbOk ? 200 : 503).json({
        status: dbOk ? 'ok' : 'degraded',
        db: dbOk ? 'ok' : 'error',
        stellar: stellarOk ? 'ok' : 'error',
        uptime: Math.floor(process.uptime()),
        version: '0.1.0',
      });
    })
    .catch(next);
};

// Health checks stay unversioned so infra probes have a stable path.
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

const memberQuerySchema = z.object({
  role: z.enum(['admin', 'treasurer', 'member', 'observer']).optional(),
});

// Validate and handle the member collection query before the generic resource
// router. This keeps query validation consistent with the API response envelope.
app.get('/api/v1/communities/:id/members', async (req, res, next) => {
  try {
    const parsed = memberQuerySchema.safeParse({
      role: queryString(req.query.role) || undefined,
    });
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        meta: {
          errors: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }

    const pagination = parsePagination(req);
    const clauses = ['community_id = $1'];
    const params: unknown[] = [req.params.id];

    if (parsed.data.role) {
      params.push(parsed.data.role);
      clauses.push(`role = $${params.length}`);
    }

    const where = clauses.join(' AND ');
    const [{ count }] = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM members WHERE ${where}`,
      params
    );

    const listParams = [...params, pagination.limit, pagination.offset];
    const members = await db.query(
      `SELECT * FROM members
       WHERE ${where}
       ORDER BY joined_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    res.json({ data: members, meta: pageMeta(count, pagination) });
  } catch (err) {
    next(err);
  }
});

// All resource routes live under the /api/v1 version prefix.
app.use('/api/v1', apiRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
