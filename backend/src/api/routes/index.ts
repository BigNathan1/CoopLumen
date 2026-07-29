import { Router } from 'express';
import * as balancesModule from './balances';
import * as communitiesModule from './communities';
import * as loansModule from './loans';
import * as tokensModule from './tokens';
import tokenTransferRouter from './tokenTransfer';

type RouterModule = Record<string, unknown>;

function extractRouter(module: RouterModule): Router {
  const candidate = Object.values(module).find(
    (value) => typeof value === 'function' && 'use' in (value as object)
  );

  if (!candidate) {
    throw new Error('Route module does not export an Express router');
  }

  return candidate as Router;
}

export const apiRouter = Router();

apiRouter.use('/communities', extractRouter(communitiesModule as RouterModule));
apiRouter.use('/balances', extractRouter(balancesModule as RouterModule));
apiRouter.use('/loans', extractRouter(loansModule as RouterModule));
apiRouter.use('/tokens', tokenTransferRouter);
apiRouter.use('/tokens', extractRouter(tokensModule as RouterModule));
