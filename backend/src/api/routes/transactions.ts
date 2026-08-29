import { Router, Request, Response, NextFunction } from 'express';
import { TransactionBuilder, Networks } from '@stellar/stellar-sdk';
import { StellarService } from '../../contracts/stellar';
import { validate } from '../middleware/validate';
import { transactionHashSchema } from '../schemas/transaction';
import { mapHorizonError } from '../utils/horizonError';

export const transactionsRouter = Router();

/**
 * @route POST /api/v1/transactions/unsigned
 * @summary Build unsigned transaction XDR
 */
transactionsRouter.post('/unsigned', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { senderPublicKey, destinationPublicKey, assetCode, assetIssuer, amount, memo } = req.body;
    const account = await StellarService.loadAccount(senderPublicKey);
    const network = StellarService.getNetwork();
    const txBuilder = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: network,
    });
    const tx = txBuilder.setTimeout(30).build();
    res.status(200).json({ data: { xdr: tx.toXDR() } });
  } catch (error) {
    next(mapHorizonError(error));
  }
});

/**
 * @route GET /api/v1/transactions/:hash
 * @summary Get transaction detail by hash from Horizon
 */
transactionsRouter.get(
  '/:hash',
  validate({ params: transactionHashSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { hash } = req.params;
      const transaction = await StellarService.getTransaction(hash);
      res.status(200).json({ data: transaction });
    } catch (error) {
      next(mapHorizonError(error));
    }
  }
);
