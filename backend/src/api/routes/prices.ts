import { Router, Request, Response, NextFunction } from 'express';
import { getXlmPriceQuerySchema } from '../schemas/price';
import { fetchXlmPrice } from '../../contracts/prices';
import { cachePrice, getCachedPrice } from '../../cache/prices';

export const pricesRouter = Router();

/**
 * GET /api/v1/prices/xlm
 * Returns the current XLM price (e.g. XLM/USD) from a public market data provider.
 * Successful responses are cached in Redis for up to 30 seconds.
 */
pricesRouter.get('/xlm', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const parsedQuery = getXlmPriceQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({
      data: null,
      error: 'Validation failed',
      meta: {
        errors: parsedQuery.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  try {
    const { currency } = parsedQuery.data;
    const cached = await getCachedPrice('XLM', currency);
    if (cached) {
      res.status(200).json({ data: cached });
      return;
    }

    const priceData = await fetchXlmPrice(currency);
    await cachePrice('XLM', currency, priceData);

    res.status(200).json({ data: priceData });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('public source') || err.message.includes('public sources'))
    ) {
      res.status(502).json({
        data: null,
        error: 'Failed to fetch price from public source.',
      });
      return;
    }
    next(err);
  }
});
