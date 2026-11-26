import { logger } from '../utils/logger';
import { detectLoanDefaults } from '../jobs/loanDefaults';

let timer: NodeJS.Timeout | null = null;

export async function checkAndExpireLoans(): Promise<void> {
  try {
    const expired = await detectLoanDefaults();
    if (expired.length > 0) {
      logger.info(`Expired/defaulted ${expired.length} loans`);
    }
  } catch (err) {
    logger.error('Error during loan expiry check', err);
  }
}

export function startLoanExpiryJob(intervalMs: number): void {
  if (timer) return;
  timer = setInterval(() => {
    void checkAndExpireLoans();
  }, intervalMs);
  timer.unref();
}

export function stopLoanExpiryJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
