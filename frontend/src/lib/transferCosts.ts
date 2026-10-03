/**
 * Cost model behind the landing page's "what it costs to move money" panel.
 *
 * The comparison is the whole argument for building on Stellar, so the numbers
 * live here as named, sourced constants rather than as copy baked into JSX —
 * they can be unit-tested, and a reviewer can check an assumption without
 * reading markup.
 *
 * Everything below is an *illustrative* model, not a quote. Real corridors vary
 * by bank, country and day, and the XLM price is a fixed assumption rather than
 * a live feed. `COST_MODEL_NOTE` is rendered alongside the panel so the page
 * never presents these as live pricing.
 */

/** A way of moving money from sender to recipient. */
export interface Rail {
  id: string;
  /** Display name, e.g. "International bank wire". */
  label: string;
  /** How long the recipient waits, in prose ("3–5 business days"). */
  settlement: string;
  /** Fixed charge applied regardless of amount, in USD. */
  flatFeeUsd: number;
  /** Proportional charge — sending fee plus FX spread — as a fraction. */
  rate: number;
}

/**
 * Stellar's base fee is 100 stroops (0.00001 XLM) per operation. A community
 * payment is a single payment operation; the trustline it rides on is a
 * one-time setup cost, not a per-transfer one.
 */
export const STELLAR_BASE_FEE_XLM = 0.00001;

/**
 * Fixed XLM price used to express the network fee in dollars. Deliberately a
 * constant: the panel compares orders of magnitude, and at these amounts the
 * answer is "effectively nothing" across any plausible price.
 */
export const ASSUMED_XLM_PRICE_USD = 0.11;

/** The network fee for one transfer, in USD. */
export const STELLAR_FEE_USD = STELLAR_BASE_FEE_XLM * ASSUMED_XLM_PRICE_USD;

/**
 * The rails compared, in descending order of cost so the panel reads as an
 * argument from worst to best.
 *
 * - Bank wire: a $25 outgoing international wire fee plus a 3% FX spread sits
 *   at the low end of the 3–7% range the PRD cites for NGO disbursement.
 * - Money transfer operator: 6.2% approximates the World Bank's global average
 *   cost of sending $200, which has hovered above 6% for a decade.
 * - CoopLumen: the Stellar base fee, with no spread — the community token is
 *   the unit of account on both ends.
 */
export const RAILS: readonly Rail[] = [
  {
    id: 'wire',
    label: 'International bank wire',
    settlement: '3–5 business days',
    flatFeeUsd: 25,
    rate: 0.03,
  },
  {
    id: 'mto',
    label: 'Money transfer operator',
    settlement: 'Minutes to 2 days',
    flatFeeUsd: 0,
    rate: 0.062,
  },
  {
    id: 'cooplumen',
    label: 'CoopLumen on Stellar',
    settlement: '3–5 seconds',
    flatFeeUsd: STELLAR_FEE_USD,
    rate: 0,
  },
];

export const COST_MODEL_NOTE =
  'Illustrative model, not a quote. Wire and operator costs are typical published rates; ' +
  'the Stellar figure is the 100-stroop base fee at an assumed $0.11 per XLM.';

/** What one rail costs to move `amountUsd`. */
export interface RailCost extends Rail {
  /** Total charge in USD. */
  feeUsd: number;
  /** What actually lands with the recipient, floored at zero. */
  receivedUsd: number;
  /** Charge as a percentage of the amount sent, e.g. `6.2`. */
  feePercent: number;
}

/**
 * Costs every rail for a given amount.
 *
 * A non-finite or negative amount is treated as zero rather than throwing: the
 * caller is a range input, and a slider should never be able to crash the page.
 */
export function computeRailCosts(amountUsd: number): RailCost[] {
  const amount = Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : 0;

  return RAILS.map((rail) => {
    const feeUsd = amount === 0 ? 0 : rail.flatFeeUsd + amount * rail.rate;

    return {
      ...rail,
      feeUsd,
      receivedUsd: Math.max(amount - feeUsd, 0),
      feePercent: amount === 0 ? 0 : (feeUsd / amount) * 100,
    };
  });
}

/**
 * What a community keeps by using CoopLumen instead of the costliest rail, for
 * a given number of transfers. This is the number the panel leads with, because
 * a savings circle moves the same money round after round.
 */
export function computeAnnualSaving(amountUsd: number, transfersPerYear: number): number {
  const costs = computeRailCosts(amountUsd);
  const worst = costs.reduce((max, rail) => (rail.feeUsd > max.feeUsd ? rail : max), costs[0]);
  const best = costs.reduce((min, rail) => (rail.feeUsd < min.feeUsd ? rail : min), costs[0]);
  const transfers =
    Number.isFinite(transfersPerYear) && transfersPerYear > 0 ? transfersPerYear : 0;

  return (worst.feeUsd - best.feeUsd) * transfers;
}

/**
 * Formats a USD amount for display. Sub-cent fees are the point of the
 * comparison, so they are shown to enough precision to read as a real number
 * rather than rounded away to `$0.00`.
 */
export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) {
    return `$${value.toFixed(6)}`;
  }

  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 100 ? 2 : 0,
  });
}
