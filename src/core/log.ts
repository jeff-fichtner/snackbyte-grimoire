/**
 * Structured logging, with redaction enforced at the logger rather than at every call site.
 *
 * Principle VII forbids secrets in logs. Relying on callers never to pass one is relying on
 * perfect vigilance forever; redacting by key name means a credential passed by mistake is
 * still not written. The cost is that a genuinely-named field is censored — which is the
 * right way round.
 */
import pino from 'pino';

/** Key names whose values never reach a log line, at any depth. */
const REDACTED = [
  'token',
  'secret',
  'password',
  'authorization',
  'signature',
  'value',
  'tokenRef',
  'secretRef',
  'DISCORD_BOT_TOKEN',
  'DATABASE_URL',
];

/** Exported so tests assert the real configuration, not a restatement of it. */
export const REDACT_PATHS = REDACTED.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  base: undefined,
});

export function childLog(name: string): pino.Logger {
  return log.child({ mod: name });
}
