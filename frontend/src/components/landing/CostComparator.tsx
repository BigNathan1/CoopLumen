'use client';

import { useId, useMemo, useState } from 'react';
import {
  COST_MODEL_NOTE,
  computeAnnualSaving,
  computeRailCosts,
  formatUsd,
} from '@/lib/transferCosts';
import styles from './CostComparator.module.css';

const MIN_AMOUNT = 50;
const MAX_AMOUNT = 10_000;
const AMOUNT_STEP = 50;
const DEFAULT_AMOUNT = 1_000;

/** How often the same money goes round. A monthly circle is the common case. */
const FREQUENCIES = [
  { value: 12, label: 'Monthly' },
  { value: 26, label: 'Fortnightly' },
  { value: 52, label: 'Weekly' },
] as const;

const DEFAULT_FREQUENCY = 12;

/**
 * The interactive heart of the page: what each rail costs to move a given
 * amount, and what a community keeps over a year by not using the dearest one.
 *
 * The arithmetic lives in `lib/transferCosts`, unit-tested and with every
 * assumption named, rather than inline here — these are the numbers a sceptical
 * reader will want to check, and they should be checkable.
 *
 * Accessibility:
 *
 * - The comparison is a table, because that is what it is. The bars are
 *   decoration inside cells that already carry the figure in text.
 * - The slider carries `aria-valuetext` so it is announced as "$1,000" rather
 *   than as a bare "1000".
 * - The headline saving is a polite live region, so dragging the slider reports
 *   the result instead of silently changing it.
 */
export function CostComparator() {
  const amountId = useId();
  const captionId = useId();
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [frequency, setFrequency] = useState<number>(DEFAULT_FREQUENCY);

  const rails = useMemo(() => computeRailCosts(amount), [amount]);
  const annualSaving = useMemo(() => computeAnnualSaving(amount, frequency), [amount, frequency]);

  // Bars are scaled against the dearest rail, so the cheapest one reads as
  // near-nothing next to it rather than against an arbitrary ceiling.
  const worstFee = Math.max(...rails.map((rail) => rail.feeUsd));

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <div className={styles.control}>
          <div className={styles.controlHead}>
            <label htmlFor={amountId} className={styles.controlLabel}>
              Amount moved
            </label>
            <output htmlFor={amountId} className={styles.controlValue}>
              {formatUsd(amount)}
            </output>
          </div>
          <input
            id={amountId}
            type="range"
            className={styles.slider}
            min={MIN_AMOUNT}
            max={MAX_AMOUNT}
            step={AMOUNT_STEP}
            value={amount}
            aria-valuetext={formatUsd(amount)}
            onChange={(event) => setAmount(Number(event.target.value))}
          />
          <div className={styles.sliderScale} aria-hidden="true">
            <span>{formatUsd(MIN_AMOUNT)}</span>
            <span>{formatUsd(MAX_AMOUNT)}</span>
          </div>
        </div>

        <fieldset className={styles.control}>
          <legend className={styles.controlLabel}>How often</legend>
          <div className={styles.segmented}>
            {FREQUENCIES.map((option) => (
              <label key={option.value} className={styles.segment}>
                <input
                  type="radio"
                  name="cost-frequency"
                  className={styles.segmentInput}
                  value={option.value}
                  checked={frequency === option.value}
                  onChange={() => setFrequency(option.value)}
                />
                <span className={styles.segmentLabel}>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {/*
        A scroll container rather than a stacked-card layout at narrow widths.
        Overriding `display` on table elements strips their implicit roles in
        most browsers, which would cost the row and column headers below; a
        table that scrolls keeps them. `tabIndex` makes the scroll region
        reachable without a pointer.
      */}
      <div className={styles.tableScroll} tabIndex={0} role="group" aria-labelledby={captionId}>
        <table className={styles.table}>
          <caption id={captionId} className="sr-only">
            Cost of moving {formatUsd(amount)} by each rail, and what the recipient receives.
          </caption>
          <thead>
            <tr>
              <th scope="col">Rail</th>
              <th scope="col">Settles in</th>
              <th scope="col" className={styles.numeric}>
                Cost
              </th>
              <th scope="col" className={styles.numeric}>
                Recipient gets
              </th>
            </tr>
          </thead>
          <tbody>
            {rails.map((rail) => {
              const isCoopLumen = rail.id === 'cooplumen';

              return (
                <tr key={rail.id} className={styles.row} data-highlight={isCoopLumen || undefined}>
                  <th scope="row" className={styles.railName}>
                    {rail.label}
                    {/* The bar sits under the name, scaled against the dearest
                      rail. A floor of 1.5% keeps a near-zero fee visible as a
                      mark rather than vanishing into the background. */}
                    <span
                      aria-hidden="true"
                      className={styles.bar}
                      style={{
                        width: `${worstFee === 0 ? 0 : Math.max((rail.feeUsd / worstFee) * 100, 1.5)}%`,
                      }}
                    />
                  </th>
                  <td className={styles.settlement}>{rail.settlement}</td>
                  <td className={styles.numeric}>
                    <span className={styles.cost}>{formatUsd(rail.feeUsd)}</span>
                    <span className={styles.percent}>{rail.feePercent.toFixed(2)}%</span>
                  </td>
                  <td className={styles.numeric}>{formatUsd(rail.receivedUsd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className={styles.result} aria-live="polite">
        <span className={styles.resultLabel}>A circle moving this much, this often, keeps</span>
        <strong className={styles.resultValue}>{formatUsd(annualSaving)}</strong>
        <span className={styles.resultLabel}>a year that would otherwise go to fees.</span>
      </p>

      <p className={styles.note}>{COST_MODEL_NOTE}</p>
    </div>
  );
}
