import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { xlmPriceQuerySchema, priceParamsSchema } from '../schemas/price';
import { PriceService } from '../../contracts/prices';
import { getCachedXlmPrice, cacheXlmPrice } from '../../cache/prices';
import { logger } from '../../utils/logger';

export const priceRouter = Router();

function respondValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    data: null,
    error: 'Validation failed',
    meta: {
      errors: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
  });
}

/**
 * Handles fetching the XLM/USD price from cache or live public providers.
 */
async function handleGetXlmPrice(req: Request, res: Response): Promise<void> {
  const parsedQuery = xlmPriceQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    respondValidationError(res, parsedQuery.error);
    return;
  }

  try {
    const cached = await getCachedXlmPrice();
    if (cached) {
      res.status(200).json({ data: cached });
      return;
    }

    const priceResult = await PriceService.getXlmPrice();
    await cacheXlmPrice(priceResult);

    res.status(200).json({ data: priceResult });
  } catch (err) {
    logger.error('Failed to fetch XLM price from public sources', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(502).json({
      data: null,
      error: 'Failed to fetch XLM price from public sources.',
    });
  }
}

/**
 * GET /api/v1/prices/xlm
 * Returns the current XLM/USD spot price from a public market source.
 */
priceRouter.get('/xlm', async (req: Request, res: Response) => {
  await handleGetXlmPrice(req, res);
});

/**
 * GET /api/v1/prices/:asset
 * Supports parameter-based asset pricing lookup (e.g. /XLM, /xlm).
 */
priceRouter.get('/:asset', async (req: Request, res: Response) => {
  const parsedParams = priceParamsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    respondValidationError(res, parsedParams.error);
    return;
  }

  await handleGetXlmPrice(req, res);
});
