'use client';

import { useEffect, useRef, useState } from 'react';
import { STELLAR_FEE_USD, formatUsd } from '@/lib/transferCosts';
import styles from './SettlementRing.module.css';

/**
 * How long the demonstration runs, in seconds — the upper end of Stellar's
 * 3–5 second finality. The animation is deliberately in real time: the claim
 * the hero is making is that this is how long a transfer actually takes, and
 * speeding it up for effect would undercut it.
 *
 * This is the single source of the timing. It reaches the stylesheet as the
 * `--settlement-duration` custom property, set inline on the stage below.
 */
const SETTLEMENT_SECONDS = 4.1;

/** Ring geometry, in the SVG's own coordinate space. */
const CENTRE = 160;
const RING_RADIUS = 112;
const MEMBER_COUNT = 8;

/** Which members the demonstration moves value between. */
const SENDER_INDEX = 0;
const RECIPIENT_INDEX = 3;

/** The example community, borrowed from the PRD's own worked example. */
const ASSET_CODE = 'ECOLGS';
const TRANSFER_AMOUNT = 250;

interface Point {
  x: number;
  y: number;
}

/**
 * Member positions around the ring, starting at twelve o'clock.
 *
 * Computed once at module scope from fixed inputs, so the server and the client
 * render byte-identical coordinates — a `Math.random` scatter here would be a
 * hydration mismatch.
 */
const MEMBERS: Point[] = Array.from({ length: MEMBER_COUNT }, (_, index) => {
  const angle = (index / MEMBER_COUNT) * 2 * Math.PI - Math.PI / 2;

  return {
    x: CENTRE + RING_RADIUS * Math.cos(angle),
    y: CENTRE + RING_RADIUS * Math.sin(angle),
  };
});

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The payment's path: a curve from sender to recipient bent through the
 * treasury at the centre, so the transfer visibly passes through the community
 * rather than around it.
 */
const ARC_PATH = `M ${round(MEMBERS[SENDER_INDEX].x)} ${round(MEMBERS[SENDER_INDEX].y)} Q ${CENTRE} ${CENTRE} ${round(MEMBERS[RECIPIENT_INDEX].x)} ${round(MEMBERS[RECIPIENT_INDEX].y)}`;

type Phase = 'idle' | 'settling' | 'settled';

/**
 * Reads the user's motion preference, defaulting to "no preference" where it
 * cannot be determined — during SSR, and in browsers without `matchMedia`.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The hero's illustration: one payment settling across a community in real
 * time, with the clock and the fee shown as it happens.
 *
 * It runs once and then rests in its settled state. A hero that loops forever
 * competes with the copy beside it for attention, and this one has made its
 * point after four seconds.
 *
 * Accessibility:
 *
 * - The whole figure is `aria-hidden` and replaced by a single sentence of
 *   text, because a screen reader gains nothing from eight unlabelled circles.
 * - Under `prefers-reduced-motion` the component mounts straight into the
 *   settled state: the same information, none of the movement.
 */
export function SettlementRing() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setElapsed(SETTLEMENT_SECONDS);
      setPhase('settled');
      return;
    }

    const start = performance.now();
    setPhase('settling');

    const tick = (now: number) => {
      const seconds = Math.min((now - start) / 1000, SETTLEMENT_SECONDS);

      // Only commit a change the readout can actually show. At one decimal that
      // is ~10 renders a second instead of one per frame.
      setElapsed((current) =>
        current.toFixed(1) === seconds.toFixed(1) && seconds < SETTLEMENT_SECONDS
          ? current
          : seconds
      );

      if (seconds < SETTLEMENT_SECONDS) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      setPhase('settled');
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const settled = phase === 'settled';

  return (
    <figure className={styles.figure} data-phase={phase}>
      <div
        aria-hidden="true"
        className={styles.stage}
        style={{ '--settlement-duration': `${SETTLEMENT_SECONDS}s` } as React.CSSProperties}
      >
        <svg viewBox="0 0 320 320" className={styles.svg} role="presentation" focusable="false">
          <defs>
            <radialGradient id="cooplumen-core-glow">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* The community's orbit. */}
          <circle className={styles.orbit} cx={CENTRE} cy={CENTRE} r={RING_RADIUS} />
          <circle className={styles.orbitInner} cx={CENTRE} cy={CENTRE} r={RING_RADIUS - 34} />

          {/* The treasury at the centre of the circle. */}
          <circle cx={CENTRE} cy={CENTRE} r="58" fill="url(#cooplumen-core-glow)" />
          <circle className={styles.core} cx={CENTRE} cy={CENTRE} r="30" />
          <text className={styles.coreLabel} x={CENTRE} y={CENTRE + 4} textAnchor="middle">
            {ASSET_CODE}
          </text>

          {/* The payment, drawn in as it settles. */}
          <path className={styles.arc} d={ARC_PATH} pathLength={1} />

          {/* The value in flight, riding the same curve as the arc. Inside the
              SVG, `offset-path` resolves in user units, so the parcel stays on
              the line at every size the stage is rendered at. */}
          <g
            className={styles.parcel}
            style={{ offsetPath: `path('${ARC_PATH}')` } as React.CSSProperties}
          >
            <rect className={styles.parcelBody} x="-21" y="-11" width="42" height="22" rx="11" />
            <text className={styles.parcelLabel} y="4" textAnchor="middle">
              {TRANSFER_AMOUNT}
            </text>
          </g>

          {MEMBERS.map((member, index) => (
            <circle
              key={index}
              className={styles.member}
              cx={member.x}
              cy={member.y}
              r="9"
              data-role={
                index === SENDER_INDEX
                  ? 'sender'
                  : index === RECIPIENT_INDEX
                    ? 'recipient'
                    : undefined
              }
            />
          ))}
        </svg>
      </div>

      <dl aria-hidden="true" className={styles.readout}>
        <div className={styles.metric}>
          <dt>Elapsed</dt>
          <dd className={styles.metricValue}>{elapsed.toFixed(1)}s</dd>
        </div>
        <div className={styles.metric}>
          <dt>Network fee</dt>
          <dd className={styles.metricValue}>{formatUsd(STELLAR_FEE_USD)}</dd>
        </div>
        <div className={styles.metric}>
          <dt>Status</dt>
          <dd className={styles.metricValue} data-settled={settled || undefined}>
            <span className={styles.statusDot} />
            {settled ? 'Settled' : 'Pending'}
          </dd>
        </div>
      </dl>

      {/*
        The equivalent for anyone not looking at the picture. `role="status"`
        rather than a live region that fires mid-animation: it is announced once,
        when the demonstration has something to report.
      */}
      <figcaption className="sr-only" role="status">
        {settled
          ? `A member sent ${TRANSFER_AMOUNT} ${ASSET_CODE} to another member of their community. It settled in ${SETTLEMENT_SECONDS} seconds for a network fee of ${formatUsd(STELLAR_FEE_USD)}.`
          : `Sending ${TRANSFER_AMOUNT} ${ASSET_CODE} across a community.`}
      </figcaption>
    </figure>
  );
}
