import express, { NextFunction, Request, Response, Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { apiRouter } from './api/routes';
import { errorHandler } from './api/middleware/errorHandler';
import { notFound } from './api/middleware/notFound';
import { requestLogger } from './api/middleware/requestLogger';
import { communityWriteLimiter } from './api/middleware/rateLimit';
import { csrfProtection } from './api/middleware/csrf';
import { db } from './db';
import { StellarService } from './contracts/stellar';

const app: Application = express();

// Behind a load balancer every request otherwise appears to come from the proxy,
// so per-IP rate limits would throttle all clients as one. Opt in with the
// number of trusted proxy hops, e.g. TRUST_PROXY=1.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(hops) ? hops : process.env.TRUST_PROXY);
}

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' }));
// Captures the exact bytes received so webhook signature verification can
// HMAC over the same payload the client signed, before JSON parsing/
// re-serialization has a chance to change its byte representation.
app.use(
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  })
);
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

// Apply the community write limit to every nested community resource endpoint.
// The limiter itself skips GET, HEAD, and OPTIONS requests.
app.use('/api/v1/communities', communityWriteLimiter);

// All resource routes live under the /api/v1 version prefix.
app.use('/api/v1', csrfProtection, apiRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
