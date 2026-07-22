/**
 * Platform configuration.
 *
 * Every value here is required and none has a fallback. A missing value fails at startup
 * naming the variable, rather than booting into wrong behaviour that surfaces later,
 * somewhere unrelated, as a mystery. A silent default turns "you forgot to set X" into a
 * buried bug; loud failure is strictly better.
 *
 * Nothing tenant-scoped belongs here. The test: if a second tenant would need a different
 * value, it is data and lives in the store.
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `${name} is not set. It is required platform configuration — see .env.example. ` +
        'Refusing to start rather than guess.',
    );
  }
  return value;
}

export interface Config {
  databaseUrl: string;
  port: number;
  /**
   * NOT read by any caller. It is the value behind `applications.token_ref` for the
   * platform's Discord application, and is reached only through `getRest(applicationId)`.
   */
  discordBotToken: string;
}

export function loadConfig(): Config {
  const port = Number(required('PORT'));
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got "${process.env.PORT}".`);
  }
  return {
    databaseUrl: required('DATABASE_URL'),
    port,
    discordBotToken: required('DISCORD_BOT_TOKEN'),
  };
}
