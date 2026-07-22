/**
 * The composition root — the one place concrete implementations are chosen and wired.
 *
 * Everything below this file takes its collaborators as arguments, which is what lets the
 * whole walk be tested against a fake store with no database in sight.
 */
import { loadConfig } from './config.js';
import { childLog } from './core/log.js';
import { PgRepository } from './db/pg-repository.js';
import { createServer } from './server.js';

const log = childLog('main');

async function start(): Promise<void> {
  // Fails loudly here, naming the variable, rather than deeper in as odd behaviour.
  const config = loadConfig();

  const repo = new PgRepository(config.databaseUrl);
  const app = createServer({ repo });

  const server = app.listen(config.port, () => {
    log.info({ port: config.port }, 'grimoire is listening');
  });

  const shutdown = (signal: string): void => {
    log.info({ signal }, 'shutting down');
    server.close(() => {
      void repo.close().then(() => process.exit(0));
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error: unknown) => {
  // Startup failure is fatal and must be legible: no partial boot, no degraded mode.
  log.fatal({ err: error instanceof Error ? error.message : String(error) }, 'failed to start');
  process.exit(1);
});
