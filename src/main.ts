/**
 * The composition root — the one place concrete implementations are chosen and wired.
 *
 * Everything below takes its collaborators as arguments, which is what lets the whole walk
 * be tested against a fake store with no database and a stub platform.
 */
import { loadConfig } from './config.js';
import { createDiscordBinding } from './bindings/discord/index.js';
import { createDiscordInteractions } from './bindings/discord/interactions.js';
import { createRegistry } from './bindings/registry.js';
import { childLog } from './core/log.js';
import { PgRepository } from './db/pg-repository.js';
import { createServer } from './server.js';
// Registering the vocabulary is a side effect of import, which is what keeps core free of
// a switch statement enumerating them.
import './core/language/verbs/post-message.js';
import './core/language/verbs/reply-random.js';
import './sources/clickup/adapter.js';
import './sources/github/adapter.js';

const log = childLog('main');

async function start(): Promise<void> {
  // Fails loudly here, naming the variable, rather than deeper in as odd behaviour.
  const config = loadConfig();

  const repo = new PgRepository(config.databaseUrl);

  // Identity is a lookup: the binding is handed a registry, never a token.
  const registry = createRegistry({
    repo,
    resolvePlatformToken: (ref) =>
      ref === 'DISCORD_BOT_TOKEN' ? config.discordBotToken : undefined,
  });
  const binding = createDiscordBinding({ registry });

  // The interaction surface is wired only when its public key is configured. Absent ⇒ the
  // endpoint is simply not served; present-but-malformed throws here, at boot, by design.
  const interactions = config.discordPublicKey
    ? createDiscordInteractions({ publicKey: config.discordPublicKey })
    : undefined;
  if (!interactions) log.warn('DISCORD_PUBLIC_KEY unset — interactions endpoint disabled');

  const application = await repo.getPlatformApplication('discord');
  if (!application) {
    throw new Error(
      'no platform application row for binding "discord". Seed one — identity is data, ' +
        'and the service will not invent it.',
    );
  }

  const app = createServer({ repo, binding, applicationId: application.id, interactions });

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
