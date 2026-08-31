import { Request, Response } from 'express';
import { z } from 'zod';
import * as StellarSdk from '@stellar/stellar-sdk';

// Configure Horizon server (ideally injected via config/env)
const HORIZON_URL = process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';
const server = new StellarSdk.Horizon.Server(HORIZON_URL);

export const submitTransactionSchema = z.object({
  xdr: z.string().min(1, 'Signed XDR string is required'),
});

/**
 * Maps Horizon error payloads to human-readable actionable messages.
 */
function mapHorizonError(error: any): string {
  if (error?.response?.data?.extras?.result_codes) {
    const codes = error.response.data.extras.result_codes;
    
    if (codes.transaction === 'tx_bad_seq') {
      return 'Transaction sequence number is out of sync. Please refresh your wallet state and try again.';
    }
    if (codes.transaction === 'tx_insufficient_balance') {
      return 'Insufficient balance to cover transaction fees or operations.';
    }
    if (codes.transaction === 'tx_bad_auth') {
      return 'Transaction signature is invalid or unauthorized.';
    }
    
    // Check operation-level errors if transaction failed generically
    if (codes.transaction === 'tx_failed' && codes.operations?.length > 0) {
      const opCode = codes.operations[0]; // Usually surface the first failed operation
      if (opCode === 'op_underfunded') return 'Insufficient funds for this operation.';
      if (opCode === 'op_no_trust') return 'Destination account does not have a trustline for this asset.';
      if (opCode === 'op_no_destination') return 'Destination account does not exist on the ledger.';
      return `Operation failed with code: ${opCode}`;
    }
  }
  
  return error?.message || 'An unexpected error occurred while submitting the transaction to Horizon.';
}

export const submitTransactionHandler = async (req: Request, res: Response) => {
  try {
    const validation = submitTransactionSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: {
          message: 'Invalid request payload',
          details: validation.error.format(),
        },
      });
    }

    const { xdr } = validation.data;

    // Load transaction from XDR.
    // Note: networkPassphrase is required in newer stellar-sdk versions to build from XDR, 
    // but submitTransaction strictly requires the Horizon submission which validates it server-side.
    const transaction = StellarSdk.TransactionBuilder.fromXDR(
      xdr,
      process.env.STELLAR_NETWORK_PASSPHRASE || StellarSdk.Networks.TESTNET
    );

    const result = await server.submitTransaction(transaction);

    return res.status(200).json({
      data: {
        hash: result.hash,
        ledger: result.ledger,
        status: 'success',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    console.error('[TRANSACTION_SUBMIT_ERROR]', error?.response?.data || error);
    
    const actionableMessage = mapHorizonError(error);

    return res.status(error?.response?.status || 500).json({
      error: {
        message: actionableMessage,
        rawCode: error?.response?.data?.extras?.result_codes?.transaction || 'unknown',
      },
    });
  }
};