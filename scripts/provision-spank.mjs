/**
 * Provision the `/spank` command instance for one tenant, in one guild.
 *
 * This is the minimal, operator-run form of the composer's "command instance = tenant data":
 *   1. register the `/spank` slash command GUILD-SCOPED (it exists in this guild and no other), and
 *   2. seed the spell that binds it to the `reply_random` verb, whose config carries the LINES.
 *
 * Idempotent: the command upserts by name, the spell is inserted only if absent. The lines below
 * are the tenant's data — when the composer exists, it edits exactly this, not code.
 *
 * Usage:
 *   DATABASE_URL=<grimoire-staging> DISCORD_BOT_TOKEN=<grimoire-dev> \
 *   TENANT_NAME="Alpha Guild" DISCORD_GUILD_ID=1527396812154212523 \
 *   node scripts/provision-spank.mjs
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

function required(name) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    console.error(`REFUSING: ${name} is not set.`);
    process.exit(1);
  }
  return v;
}

const DISCORD_API = 'https://discord.com/api/v10';
const databaseUrl = required('DATABASE_URL');
const token = required('DISCORD_BOT_TOKEN');
const tenantName = required('TENANT_NAME');
const guildId = required('DISCORD_GUILD_ID');

// The tenant's data. Suggestive by design — this is the Playboy Lounge's command.
const LINES = [
  '🍑 {caster} bends {target} over and delivers a slow, deliberate spank. 👋',
  '{caster} spanks {target} — and lets their hand linger a little too long. 😏',
  'SMACK. {caster} leaves a handprint on {target} they’ll still feel tonight. 🍑',
  '{caster} pulls {target} in close and spanks them hard enough to make them gasp. 💋',
  '{caster} takes {target} over their knee. The Lounge pretends not to watch. 🔥',
  '{caster} spanks {target} and murmurs, “you’ve earned this.” 😈',
  '{caster}’s palm meets {target}’s 🍑 — and {target} bites their lip and asks for another.',
  '{target} has been very, very bad. {caster} makes sure they feel every last one. 🍑👋',
];

const commandDef = {
  name: 'spank',
  type: 1, // CHAT_INPUT
  description: 'Spank someone. Consequences unclear.',
  options: [{ name: 'target', description: 'who is getting spanked', type: 6, required: true }],
};

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
  if (!install) throw new Error(`no discord install for guild ${guildId} — seed the tenant first`);
  if (install.tenant_id !== tenant.id) {
    throw new Error(`guild ${guildId} belongs to a different tenant (${install.tenant_id})`);
  }

  // 1. register /spank guild-scoped (POST upserts by name; PUT would wipe other commands).
  const app = await discord('GET', '/applications/@me');
  const registered = await discord('POST', `/applications/${app.id}/guilds/${guildId}/commands`, commandDef);
  console.log(`registered /spank in guild ${guildId} (command ${registered.id})`);

  // 2. seed the spell — upsert so re-running updates the lines (the tenant's data), not just creates.
  await client.query(
    `INSERT INTO spells (id, tenant_id, name, trigger_species, source, event_type, condition, verb, verb_config)
     VALUES ($1, $2, 'Spank', 'interaction', 'discord', 'spank', NULL, 'reply_random', $3::jsonb)
     ON CONFLICT (tenant_id, name) DO UPDATE SET verb_config = EXCLUDED.verb_config, enabled = true`,
    [randomUUID(), tenant.id, JSON.stringify({ lines: LINES })],
  );
  console.log(`spank spell ready for tenant "${tenantName}" (${LINES.length} lines)`);
  console.log('\ntry it: /spank @someone');
} catch (error) {
  console.error('provision failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
