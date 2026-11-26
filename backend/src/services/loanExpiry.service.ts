import { detectLoanDefaults } from '../jobs/loanDefaults';
import { logger } from '../utils/logger';

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const defaulted = await detectLoanDefaults();
    if (defaulted.length > 0) {
      logger.info(`Loan expiry job defaulted ${defaulted.length} loan(s)`);
    }
  } catch (error) {
    logger.error('Loan expiry job failed', { error });
  } finally {
    running = false;
  }
}

/**
 * Starts the periodic overdue-loan sweep. The timer is unref'd so it never
 * keeps the process alive on its own, and a slow sweep is never overlapped.
 */
export function startLoanExpiryJob(intervalMs: number): void {
  if (timer) return;
  timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
}

/** Stops the sweep, waiting for no in-flight run (the tick finishes itself). */
export function stopLoanExpiryJob(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
