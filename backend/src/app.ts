import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { communityRouter } from './api/routes/communities';
import { tokenRouter } from './api/routes/tokens';
import { balanceRouter } from './api/routes/balances';
import { errorHandler } from './api/middleware/errorHandler';
import { notFound } from './api/middleware/notFound';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' }));
app.use(express.json());
app.use(morgan('combined'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

app.use('/api/communities', communityRouter);
app.use('/api/tokens', tokenRouter);
app.use('/api/balances', balanceRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
