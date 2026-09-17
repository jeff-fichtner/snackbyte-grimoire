/**
 * Provision a slash-command instance for one tenant, in one guild.
 *
 * This is the minimal, operator-run form of the composer's "command instance = tenant data":
 *   1. register the slash command GUILD-SCOPED (it exists in this guild and no other), and
 *   2. seed the spell that binds it to the `reply_random` verb, whose config carries the lines.
 *
 * The instance — command name, description, options, spell name, lines — is the TENANT'S data
 * and lives in a definition file the operator holds, never in this repo. The script is the
 * mechanism and knows no instance. When the composer exists, it edits exactly what the file
 * holds, not code.
 *
 * Idempotent: the command upserts by name, the spell upserts by (tenant, name) so re-running
 * updates the lines.
 *
 * Definition file (JSON):
 *   {
 *     "command": {
 *       "name": "…",                       // the slash command, lowercase, no leading slash
 *       "description": "…",
 *       "options": [{ "name": "target", "description": "…", "type": 6, "required": true }]
 *     },
 *     "spell": { "name": "…", "lines": ["{caster} … {target} …", …] }
 *   }
 *   Option names become the event's facts: a USER option (type 6) named `target` yields
 *   `{target}` (a pinging mention), `{target_id}` and `{target_name}`; `{caster}` is always there.
 *
 * Usage:
 *   DATABASE_URL=<grimoire-staging> DISCORD_BOT_TOKEN=<grimoire-dev> \
 *   TENANT_NAME="Alpha Guild" DISCORD_GUILD_ID=1527396812154212523 \
 *   node scripts/provision-command.mjs /path/to/definition.json
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DISCORD_API = 'https://discord.com/api/v10';

/** Discord's own constraint on a CHAT_INPUT command name. */
const COMMAND_NAME = /^[a-z0-9_-]{1,32}$/;

/**
 * Parse and validate a definition file's text. Loud on every gap — a half-shaped command
 * registers with Discord and then never matches a spell, which is worse than no command.
 */
export function parseDefinition(raw) {
  const def = JSON.parse(raw);
  const command = def?.command;
  const spell = def?.spell;
  if (typeof command !== 'object' || command === null) {
    throw new Error('definition needs a "command" object');
  }
  if (typeof spell !== 'object' || spell === null) {
    throw new Error('definition needs a "spell" object');
  }
  if (typeof command.name !== 'string' || !COMMAND_NAME.test(command.name)) {
    throw new Error('command.name must be 1–32 chars of [a-z0-9_-], with no leading slash');
  }
  if (typeof command.description !== 'string' || command.description.length === 0) {
    throw new Error('command.description must be a non-empty string');
  }
  if (!Array.isArray(command.options)) {
    throw new Error('command.options must be an array (empty is fine)');
  }
  for (const opt of command.options) {
    if (
      typeof opt?.name !== 'string' ||
      typeof opt?.description !== 'string' ||
      typeof opt?.type !== 'number'
    ) {
      throw new Error(
        'every command option needs a string name, a string description, and a numeric type',
      );
    }
  }
  if (typeof spell.name !== 'string' || spell.name.length === 0) {
    throw new Error('spell.name must be a non-empty string');
  }
  if (!Array.isArray(spell.lines) || spell.lines.length === 0) {
    throw new Error('spell.lines must be a non-empty array');
  }
  for (const line of spell.lines) {
    if (typeof line !== 'string' || line.length === 0) {
      throw new Error('every spell line must be a non-empty string');
    }
  }
  return {
    command: {
      name: command.name,
      type: 1, // CHAT_INPUT
      description: command.description,
      options: command.options,
    },
    spell: { name: spell.name, lines: spell.lines },
  };
}

function required(name) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    console.error(`REFUSING: ${name} is not set.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const definitionPath = process.argv[2];
  if (!definitionPath) {
    console.error('usage: node scripts/provision-command.mjs <definition.json>');
    process.exit(2);
  }
  let definition;
  try {
    definition = parseDefinition(readFileSync(definitionPath, 'utf8'));
  } catch (error) {
    console.error(
      `REFUSING: ${definitionPath} — ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
  const { command, spell } = definition;

  const databaseUrl = required('DATABASE_URL');
  const token = required('DISCORD_BOT_TOKEN');
  const tenantName = required('TENANT_NAME');
  const guildId = required('DISCORD_GUILD_ID');

  async function discord(method, path, body) {
    const res = await fetch(DISCORD_API + path, {
      method,
      headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
    return res.json();
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const tenant = (await client.query('SELECT id FROM tenants WHERE name = $1', [tenantName]))
      .rows[0];
    if (!tenant) throw new Error(`no tenant named "${tenantName}"`);

    // The command can only be reached if this guild maps to this tenant. Fail loud otherwise —
    // a spell that no interaction can arrive at is worse than none.
    const install = (
      await client.query(
        `SELECT tenant_id FROM installs WHERE binding = 'discord' AND community_ref = $1 AND enabled`,
        [guildId],
      )
    ).rows[0];
    if (!install)
      throw new Error(`no discord install for guild ${guildId} — seed the tenant first`);
    if (install.tenant_id !== tenant.id) {
      throw new Error(`guild ${guildId} belongs to a different tenant (${install.tenant_id})`);
    }

    // 1. register the command guild-scoped (POST upserts by name; PUT would wipe other commands).
    const app = await discord('GET', '/applications/@me');
    const registered = await discord(
      'POST',
      `/applications/${app.id}/guilds/${guildId}/commands`,
      command,
    );
    console.log(`registered /${command.name} in guild ${guildId} (command ${registered.id})`);

    // 2. seed the spell — upsert so re-running updates the lines (the tenant's data), not just creates.
    await client.query(
      `INSERT INTO spells (id, tenant_id, name, trigger_species, source, event_type, condition, verb, verb_config)
       VALUES ($1, $2, $3, 'interaction', 'discord', $4, NULL, 'reply_random', $5::jsonb)
       ON CONFLICT (tenant_id, name) DO UPDATE SET verb_config = EXCLUDED.verb_config, enabled = true`,
      [randomUUID(), tenant.id, spell.name, command.name, JSON.stringify({ lines: spell.lines })],
    );
    console.log(
      `spell "${spell.name}" ready for tenant "${tenantName}" (${spell.lines.length} lines)`,
    );
    console.log(`\ntry it: /${command.name} @someone`);
  } catch (error) {
    console.error('provision failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
