import { Router } from 'express';
import { communityRouter } from './communities';
import { tokenRouter } from './tokens';
import { balanceRouter } from './balances';
import { loanRouter } from './loans';
import { transactionRouter } from './transactions';
import { pricesRouter } from './prices';

/**
 * Combined API router. Mounted under the `/api/v1` version prefix in app.ts so
 * that future breaking changes can ship under `/api/v2` without disturbing
 * existing clients.
 */
export const apiRouter = Router();

apiRouter.use('/communities', communityRouter);
apiRouter.use('/tokens', tokenRouter);
apiRouter.use('/balances', balanceRouter);
apiRouter.use('/loans', loanRouter);
apiRouter.use('/transactions', transactionRouter);
apiRouter.use('/prices', pricesRouter);
