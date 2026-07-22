/**
 * Seed a development database with everything one invocation needs.
 *
 * Creates TWO tenants deliberately. One tenant cannot demonstrate isolation — the property
 * most likely to be wrong is the one a single-tenant fixture cannot show.
 *
 * Idempotent: re-running replaces the seeded rows rather than duplicating them.
 *
 * Usage:
 *   DATABASE_URL=... DISCORD_CHANNEL_A=<channel id> DISCORD_GUILD_A=<guild id> npm run seed:dev
 *
 * The channel/guild ids are optional — without them you get placeholder refs that exercise
 * the whole walk except the final send.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Refusing to guess a database to seed.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const tenants = [
  {
    key: 'alpha',
    name: 'Alpha Guild',
    secret: process.env.SEED_SECRET_A ?? 'dev-secret-alpha',
    clickupSecret: process.env.SEED_CLICKUP_SECRET_A ?? 'dev-clickup-alpha',
    guild: process.env.DISCORD_GUILD_A ?? 'guild-alpha',
    channel: process.env.DISCORD_CHANNEL_A ?? 'channel-alpha',
  },
  {
    key: 'beta',
    name: 'Beta Guild',
    secret: process.env.SEED_SECRET_B ?? 'dev-secret-beta',
    clickupSecret: process.env.SEED_CLICKUP_SECRET_B ?? 'dev-clickup-beta',
    guild: process.env.DISCORD_GUILD_B ?? 'guild-beta',
    channel: process.env.DISCORD_CHANNEL_B ?? 'channel-beta',
  },
];

await client.query('BEGIN');
try {
  // Wipe only what this script owns, children first. The order matters: destinations
  // reference installs, and everything references tenants.
  const names = tenants.map((t) => t.name);
  const owned = 'SELECT id FROM tenants WHERE name = ANY($1)';
  for (const table of [
    'records',
    'spells',
    'destinations',
    'installs',
    'source_registrations',
    'secrets',
  ]) {
    await client.query(`DELETE FROM ${table} WHERE tenant_id IN (${owned})`, [names]);
  }
  await client.query('DELETE FROM tenants WHERE name = ANY($1)', [names]);

  // The platform's identity. One row, tenant_id NULL — reached only via getRest().
  const application = await client.query(
    `INSERT INTO applications (binding, tenant_id, token_ref)
     VALUES ('discord', NULL, 'DISCORD_BOT_TOKEN')
     ON CONFLICT (binding) WHERE tenant_id IS NULL
     DO UPDATE SET token_ref = EXCLUDED.token_ref
     RETURNING id`,
  );

  const summary = [];
  for (const t of tenants) {
    const tenantId = randomUUID();
    const registrationId = randomUUID();
    const clickupRegistrationId = randomUUID();
    const destinationId = randomUUID();
    const installId = randomUUID();

    await client.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [tenantId, t.name]);
    await client.query(
      `INSERT INTO installs (id, tenant_id, binding, community_ref) VALUES ($1,$2,'discord',$3)`,
      [installId, tenantId, t.guild],
    );
    await client.query(
      'INSERT INTO destinations (id, tenant_id, install_id, channel_ref) VALUES ($1,$2,$3,$4)',
      [destinationId, tenantId, installId, t.channel],
    );
    await client.query(
      `INSERT INTO source_registrations (id, tenant_id, source, secret_ref)
       VALUES ($1,$2,'github','github.signing')`,
      [registrationId, tenantId],
    );
    await client.query('INSERT INTO secrets (tenant_id, ref, value) VALUES ($1, $2, $3)', [
      tenantId,
      'github.signing',
      t.secret,
    ]);
    // A SECOND source, seeded the same way as the first. If adding one ever needs more than a
    // registration, a secret and a spell, the registry's promise has quietly stopped holding.
    await client.query(
      `INSERT INTO source_registrations (id, tenant_id, source, secret_ref)
       VALUES ($1,$2,'clickup','clickup.signing')`,
      [clickupRegistrationId, tenantId],
    );
    await client.query('INSERT INTO secrets (tenant_id, ref, value) VALUES ($1, $2, $3)', [
      tenantId,
      'clickup.signing',
      t.clickupSecret,
    ]);
    await client.query(
      `INSERT INTO spells (id, tenant_id, name, trigger_species, source, event_type, condition, verb, verb_config)
       VALUES ($1,$2,$3,'external_call','github','release',$4,'post_message',$5)`,
      [
        randomUUID(),
        tenantId,
        'Relay the deployment',
        // Only tagged releases speak. Anything else is declined, not failed.
        JSON.stringify({ op: 'startsWith', fact: 'tag', value: 'v' }),
        JSON.stringify({
          destinationId,
          transform: { template: '{repository} released **{tag}** — {url}' },
        }),
      ],
    );
    // The predecessor's clickup route, translated: no condition, every status change relays.
    await client.query(
      `INSERT INTO spells (id, tenant_id, name, trigger_species, source, event_type, condition, verb, verb_config)
       VALUES ($1,$2,$3,'external_call','clickup','taskStatusUpdated',NULL,'post_message',$4)`,
      [
        randomUUID(),
        tenantId,
        'Relay the task status',
        JSON.stringify({
          destinationId,
          transform: { template: '{user}: {status_before} → **{status}** — {url}' },
        }),
      ],
    );

    summary.push({ tenant: t.name, registrationId, secret: t.secret, channel: t.channel });
  }

  await client.query('COMMIT');

  console.log(`\napplication (platform): ${application.rows[0].id}\n`);
  for (const s of summary) {
    console.log(`${s.tenant}`);
    console.log(`  webhook URL   /invoke/${s.registrationId}`);
    console.log(`  secret        ${s.secret}`);
    console.log(`  posts to      ${s.channel}`);
    console.log('');
  }
  console.log('Two tenants on purpose: one cannot demonstrate isolation.\n');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('seed failed, rolled back:', error instanceof Error ? error.message : error);
  await client.end();
  process.exit(1);
}

await client.end();
