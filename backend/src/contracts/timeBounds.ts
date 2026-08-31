import { TransactionBuilder } from '@stellar/stellar-sdk';

/**
 * How long a transaction stays submittable when the caller does not say.
 * Matches the timeout the builders used before time bounds were configurable.
 */
export const DEFAULT_TIMEOUT_SECONDS = 30;

/** Largest value the protocol accepts for a time bound (2^64 - 1 is unreachable in practice). */
const MAX_UNIX_SECONDS = 253_402_300_799; // 9999-12-31T23:59:59Z

/**
 * A point in time, accepted as:
 * - a `Date`;
 * - a number, or numeric string, of **seconds** since the Unix epoch;
 * - any other string, parsed as an ISO 8601 timestamp.
 */
export type TimeBound = number | string | Date;

export interface TimeBoundsInput {
  /** Earliest time the transaction may be included. Omitted or `0` means no lower bound. */
  minTime?: TimeBound;
  /**
   * Time after which the transaction expires. Omitted means
   * `now + DEFAULT_TIMEOUT_SECONDS`; an explicit `0` means it never expires.
   */
  maxTime?: TimeBound;
}

/** Raised when time bounds cannot be represented, or would expire on arrival. */
export class TimeBoundsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeBoundsValidationError';
  }
}

function formatSeconds(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

/** Normalises a caller-supplied bound to whole seconds since the Unix epoch. */
function toUnixSeconds(value: TimeBound, label: string): number {
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    if (Number.isNaN(milliseconds)) {
      throw new TimeBoundsValidationError(`${label} is an invalid Date.`);
    }
    return Math.floor(milliseconds / 1000);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TimeBoundsValidationError(`${label} must be a finite number of seconds.`);
    }
    return Math.floor(value);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TimeBoundsValidationError(`${label} cannot be empty.`);
  }

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new TimeBoundsValidationError(
      `${label} must be Unix seconds or an ISO 8601 timestamp (got "${value}").`
    );
  }

  return Math.floor(parsed / 1000);
}

function assertInRange(seconds: number, label: string): void {
  if (seconds < 0) {
    throw new TimeBoundsValidationError(`${label} cannot be negative.`);
  }
  if (seconds > MAX_UNIX_SECONDS) {
    throw new TimeBoundsValidationError(`${label} is too far in the future to be represented.`);
  }
}

export interface ResolvedTimeBounds {
  /** Seconds since the Unix epoch; `0` means unbounded. */
  minTime: number;
  maxTime: number;
}

export interface ResolveTimeBoundsOptions {
  /** Fallback window when no `maxTime` is given. Defaults to {@link DEFAULT_TIMEOUT_SECONDS}. */
  defaultTimeoutSeconds?: number;
  /** Reference "now" in Unix seconds. Defaults to the current time; injectable for tests. */
  nowSeconds?: number;
}

/**
 * Resolves caller-supplied bounds into the two integers the protocol wants.
 *
 * Omitting `maxTime` yields `now + defaultTimeoutSeconds` rather than `0`, so a
 * transaction never silently becomes valid forever -- an indefinitely
 * submittable signed envelope is a replay risk. `maxTime: 0` opts out
 * explicitly, for the rare case that is genuinely wanted.
 *
 * @throws {TimeBoundsValidationError} when the bounds cannot be represented or
 * describe a window that has already closed.
 */
export function resolveTimeBounds(
  timeBounds: TimeBoundsInput = {},
  options: ResolveTimeBoundsOptions = {}
): ResolvedTimeBounds {
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const defaultTimeoutSeconds = options.defaultTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;

  const minTime =
    timeBounds.minTime === undefined ? 0 : toUnixSeconds(timeBounds.minTime, 'minTime');
  assertInRange(minTime, 'minTime');

  const maxTime =
    timeBounds.maxTime === undefined
      ? nowSeconds + defaultTimeoutSeconds
      : toUnixSeconds(timeBounds.maxTime, 'maxTime');
  assertInRange(maxTime, 'maxTime');

  if (maxTime === 0) {
    return { minTime, maxTime: 0 };
  }

  if (minTime !== 0 && maxTime <= minTime) {
    throw new TimeBoundsValidationError(
      `maxTime (${formatSeconds(maxTime)}) must be after minTime (${formatSeconds(minTime)}).`
    );
  }

  if (maxTime <= nowSeconds) {
    throw new TimeBoundsValidationError(
      `maxTime (${formatSeconds(maxTime)}) is in the past; the transaction would expire before it could be submitted.`
    );
  }

  return { minTime, maxTime };
}

/**
 * Applies time bounds to a builder and returns it, so builders in this layer
 * end with `applyTimeBounds(builder, timeBounds).build()` instead of a
 * hard-coded `.setTimeout(30)`.
 */
export function applyTimeBounds(
  builder: TransactionBuilder,
  timeBounds?: TimeBoundsInput,
  options: ResolveTimeBoundsOptions = {}
): TransactionBuilder {
  const { minTime, maxTime } = resolveTimeBounds(timeBounds, options);
  return builder.setTimebounds(minTime, maxTime);
}
