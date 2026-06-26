import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { apiRouter } from './api/routes';
import { errorHandler } from './api/middleware/errorHandler';
import { notFound } from './api/middleware/notFound';
import { requestLogger } from './api/middleware/requestLogger';
import { db } from './db';
import { StellarService } from './contracts/stellar';

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

// All resource routes live under the /api/v1 version prefix.
app.use('/api/v1', apiRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
