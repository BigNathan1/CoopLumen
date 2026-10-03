import {
  ASSUMED_XLM_PRICE_USD,
  RAILS,
  STELLAR_BASE_FEE_XLM,
  STELLAR_FEE_USD,
  computeAnnualSaving,
  computeRailCosts,
  formatUsd,
} from '../transferCosts';

/** The rail the landing page is arguing for. */
const COOPLUMEN = 'cooplumen';

function costFor(id: string, amount: number) {
  const rail = computeRailCosts(amount).find((entry) => entry.id === id);
  if (!rail) throw new Error(`no rail with id ${id}`);
  return rail;
}

describe('computeRailCosts', () => {
  it('charges a wire its flat fee plus its spread', () => {
    // $25 flat + 3% of $1,000.
    expect(costFor('wire', 1000).feeUsd).toBeCloseTo(55, 10);
  });

  it('charges an operator a pure percentage', () => {
    expect(costFor('mto', 1000).feeUsd).toBeCloseTo(62, 10);
  });

  it('charges the Stellar base fee regardless of amount', () => {
    expect(costFor(COOPLUMEN, 50).feeUsd).toBeCloseTo(STELLAR_FEE_USD, 12);
    expect(costFor(COOPLUMEN, 500_000).feeUsd).toBeCloseTo(STELLAR_FEE_USD, 12);
  });

  it('derives the Stellar fee from the base fee and the assumed price', () => {
    expect(STELLAR_FEE_USD).toBeCloseTo(STELLAR_BASE_FEE_XLM * ASSUMED_XLM_PRICE_USD, 12);
  });

  it('reports the fee as a percentage of the amount sent', () => {
    expect(costFor('mto', 200).feePercent).toBeCloseTo(6.2, 10);
  });

  it('nets the fee off what the recipient receives', () => {
    const wire = costFor('wire', 1000);
    expect(wire.receivedUsd).toBeCloseTo(1000 - wire.feeUsd, 10);
  });

  it('never reports a negative amount received when fees exceed the transfer', () => {
    // $10 cannot absorb a $25 wire fee.
    expect(costFor('wire', 10).receivedUsd).toBe(0);
  });

  it('returns a zero-cost row for every rail at a zero amount', () => {
    for (const rail of computeRailCosts(0)) {
      expect(rail.feeUsd).toBe(0);
      expect(rail.receivedUsd).toBe(0);
      expect(rail.feePercent).toBe(0);
    }
  });

  it.each([NaN, Infinity, -500])('treats %p as a zero amount rather than throwing', (amount) => {
    expect(computeRailCosts(amount).every((rail) => rail.feeUsd === 0)).toBe(true);
  });

  it('covers every declared rail', () => {
    expect(computeRailCosts(100)).toHaveLength(RAILS.length);
  });
});

describe('computeAnnualSaving', () => {
  it('multiplies the gap between the dearest and cheapest rail by the transfer count', () => {
    // Operator ($62) is dearest at $1,000; CoopLumen is cheapest.
    const perTransfer = 62 - STELLAR_FEE_USD;
    expect(computeAnnualSaving(1000, 12)).toBeCloseTo(perTransfer * 12, 8);
  });

  it('is zero when no transfers are made', () => {
    expect(computeAnnualSaving(1000, 0)).toBe(0);
  });

  it('treats a nonsensical transfer count as zero', () => {
    expect(computeAnnualSaving(1000, -4)).toBe(0);
  });
});

describe('formatUsd', () => {
  it('shows sub-cent fees with enough precision to read as a real number', () => {
    expect(formatUsd(0.0000011)).toBe('$0.000001');
  });

  it('shows cents on everyday amounts', () => {
    expect(formatUsd(62)).toBe('$62.00');
  });

  it('drops cents once the amount is large enough not to need them', () => {
    expect(formatUsd(1000)).toBe('$1,000');
  });

  it('formats zero as a plain amount rather than a fraction', () => {
    expect(formatUsd(0)).toBe('$0.00');
  });
});
