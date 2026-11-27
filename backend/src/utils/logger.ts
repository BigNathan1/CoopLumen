import winston from 'winston';

const SECRET_KEY = /authorization|cookie|token|secret|private.?key|signature|x-api-key/i;

export function redactSensitive(value: unknown, key = ''): unknown {
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
      .replace(/S[A-Z2-7]{55}/g, '[STELLAR_SECRET_REDACTED]');
  }
  if (value instanceof Error) {
    // message and stack are non-enumerable, so spreading the error on its own
    // would drop the only useful parts of the entry.
    return redactSensitive(
      { ...value, name: value.name, message: value.message, stack: value.stack },
      key
    );
  }
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
        childKey,
        redactSensitive(child, childKey),
      ])
    );
  }
  return value;
}

const redactFormat = winston.format((info) => {
  const redacted = redactSensitive(info) as winston.Logform.TransformableInfo;
  // Winston tags every entry with symbols (the level among them). The plain
  // copy above drops them, and a transport cannot level an entry without the
  // tag, so it is discarded before it is formatted or written.
  for (const symbol of Object.getOwnPropertySymbols(info)) {
    (redacted as unknown as Record<symbol, unknown>)[symbol] = (
      info as unknown as Record<symbol, unknown>
    )[symbol];
  }
  return redacted;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    redactFormat(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production' ? winston.format.json() : winston.format.prettyPrint()
  ),
  transports: [new winston.transports.Console()],
  // Quiet under Jest so failures are not buried in request logs; set
  // LOG_LEVEL to see them while debugging a test.
  silent: process.env.NODE_ENV === 'test' && !process.env.LOG_LEVEL,
});
