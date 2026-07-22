/**
 * Seed the PRODUCTION database with its first real tenant.
 *
 * This is not seed-dev. seed-dev builds two demonstration tenants (Alpha/Beta) with a decoy
 * for isolation testing and re-runs by DELETING and recreating them. Production has real
 * tenants and no decoy, and a seed that deletes rows is a seed that can erase a live tenant,
 * so this one is strictly additive: every insert is guarded by NOT EXISTS / ON CONFLICT and
 * a second run changes nothing.
 *
 * Every required value comes from the environment and NONE has a fallback. A missing channel,
 * guild, or webhook secret makes this refuse loudly rather than seed a tenant that points at
 * the wrong place or authenticates against a guessed secret.
 *
 * Usage:
 *   DATABASE_URL=<grimoire-prod> \
 *   TENANT_NAME="Playboy Lounge" \
 *   DISCORD_GUILD_ID=1412143249229090930 \
 *   DISCORD_CHANNEL_ID=1519096704723587203 \
 *   GITHUB_WEBHOOK_SECRET=... CLICKUP_WEBHOOK_SECRET=... \
 *   node scripts/seed-prod.mjs
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    console.error(`REFUSING TO SEED: ${name} is not set. A production seed guesses nothing.`);
    process.exit(1);
  }
  return value;
}

const databaseUrl = required('DATABASE_URL');
const tenantName = required('TENANT_NAME');
const guildId = required('DISCORD_GUILD_ID');
const channelId = required('DISCORD_CHANNEL_ID');
const githubSecret = required('GITHUB_WEBHOOK_SECRET');
const clickupSecret = required('CLICKUP_WEBHOOK_SECRET');

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
await client.query('BEGIN');
try {
  // The platform's identity: one row, tenant_id NULL, reached only via getRest(). token_ref
  // names the env var the runtime reads (injected from Secret Manager), never a stored token.
  await client.query(
    `INSERT INTO applications (binding, tenant_id, token_ref)
     VALUES ('discord', NULL, 'DISCORD_BOT_TOKEN')
     ON CONFLICT (binding) WHERE tenant_id IS NULL
     DO UPDATE SET token_ref = EXCLUDED.token_ref`,
  );

  // The tenant, keyed by name so a re-run finds the existing one rather than making a second.
  let tenant = await client.query('SELECT id FROM tenants WHERE name = $1', [tenantName]);
  let tenantId;
  if (tenant.rowCount === 0) {
    tenantId = randomUUID();
    await client.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [tenantId, tenantName]);
  } else {
    tenantId = tenant.rows[0].id;
  }

  const installId = randomUUID();
  await client.query(
    `INSERT INTO installs (id, tenant_id, binding, community_ref)
     SELECT $1, $2, 'discord', $3
     WHERE NOT EXISTS (SELECT 1 FROM installs WHERE tenant_id = $2 AND community_ref = $3)`,
    [installId, tenantId, guildId],
  );
  const install = await client.query(
    'SELECT id FROM installs WHERE tenant_id = $1 AND community_ref = $2',
    [tenantId, guildId],
  );
  const resolvedInstallId = install.rows[0].id;

  const destinationId = randomUUID();
  await client.query(
    `INSERT INTO destinations (id, tenant_id, install_id, channel_ref)
     SELECT $1, $2, $3, $4
     WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE tenant_id = $2 AND channel_ref = $4)`,
    [destinationId, tenantId, resolvedInstallId, channelId],
  );
  const destination = await client.query(
    'SELECT id FROM destinations WHERE tenant_id = $1 AND channel_ref = $2',
    [tenantId, channelId],
  );
  const resolvedDestinationId = destination.rows[0].id;

  // Secrets by reference — resolved from this table, never rendered, never in a spell row.
  for (const [ref, value] of [
    ['github.signing', githubSecret],
    ['clickup.signing', clickupSecret],
  ]) {
    await client.query(
      `INSERT INTO secrets (tenant_id, ref, value) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, ref) DO UPDATE SET value = EXCLUDED.value`,
      [tenantId, ref, value],
    );
  }

  // One registration per source. The id is what a webhook URL carries; a re-run keeps it.
  const registrations = {};
  for (const [source, secretRef] of [
    ['github', 'github.signing'],
    ['clickup', 'clickup.signing'],
  ]) {
    await client.query(
      `INSERT INTO source_registrations (id, tenant_id, source, secret_ref)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (SELECT 1 FROM source_registrations WHERE tenant_id = $2 AND source = $3)`,
      [randomUUID(), tenantId, source, secretRef],
    );
    const reg = await client.query(
      'SELECT id FROM source_registrations WHERE tenant_id = $1 AND source = $2',
      [tenantId, source],
    );
    registrations[source] = reg.rows[0].id;
  }

  // The spells — the same sentences staging proved, into this tenant's channel. Conditions
  // guard the events these were NOT written for (a tag push has no branch; a task creation
  // has no previous status), the lesson staging taught on real traffic.
  const spells = [
    {
      name: 'Relay the push',
      source: 'github',
      eventType: 'push',
      condition: { op: 'not', of: { op: 'equals', fact: 'branch', value: '' } },
      template: '{sender} pushed to **{branch}** — {commit_message}\n{compare}',
    },
    {
      name: 'Relay the deployment',
      source: 'github',
      eventType: 'release',
      condition: { op: 'startsWith', fact: 'tag', value: 'v' },
      template: '{repository} released **{tag}** — {url}',
    },
    {
      name: 'Relay the task status',
      source: 'clickup',
      eventType: 'taskStatusUpdated',
      condition: { op: 'not', of: { op: 'equals', fact: 'status_before', value: '' } },
      template: '{user}: {status_before} → **{status}** — {url}',
    },
  ];
  for (const s of spells) {
    await client.query(
      `INSERT INTO spells (id, tenant_id, name, trigger_species, source, event_type, condition, verb, verb_config)
       SELECT $1, $2, $3, 'external_call', $4, $5, $6::jsonb, 'post_message', $7::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM spells WHERE tenant_id = $2 AND source = $4 AND event_type = $5
       )`,
      [
        randomUUID(),
        tenantId,
        s.name,
        s.source,
        s.eventType,
        JSON.stringify(s.condition),
        JSON.stringify({
          destinationId: resolvedDestinationId,
          transform: { template: s.template },
        }),
      ],
    );
  }

  await client.query('COMMIT');
  console.log(`\nseeded production tenant "${tenantName}"`);
  console.log(`  guild   ${guildId}`);
  console.log(`  channel ${channelId}`);
  console.log(`  github   /invoke/${registrations.github}`);
  console.log(`  clickup  /invoke/${registrations.clickup}\n`);
} catch (error) {
  await client.query('ROLLBACK');
  console.error('seed failed, rolled back:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
await client.end();
