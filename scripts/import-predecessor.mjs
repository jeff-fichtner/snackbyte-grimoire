/**
 * Read the predecessor's configuration and translate what still means something here.
 *
 * STRICTLY READ-ONLY on the source. It opens the connection with a read-only transaction and
 * never issues a write — the predecessor is still serving production, and a migration tool
 * that can damage the thing it is migrating from is not a migration tool.
 *
 * The schemas do not correspond, and that is the point of the reset: the predecessor has
 * routes and targets with no notion of ownership; Grimoire has spells and destinations that
 * belong to a tenant. So this translates rather than copies, and it says plainly what it
 * could not bring across instead of silently dropping it.
 *
 * Usage:
 *   SOURCE_DATABASE_URL=<predecessor>  node scripts/import-predecessor.mjs            # inspect
 *   SOURCE_DATABASE_URL=<predecessor>  node scripts/import-predecessor.mjs --sql      # emit SQL
 *   SOURCE_DATABASE_URL=... DATABASE_URL=<grimoire> node scripts/import-predecessor.mjs --apply
 *
 * `--apply` needs TENANT_NAME (default "Imported") and writes only to DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const sourceUrl = process.env.SOURCE_DATABASE_URL;
if (!sourceUrl) {
  console.error('SOURCE_DATABASE_URL is not set (the predecessor database to read).');
  process.exit(1);
}
const mode = process.argv.includes('--apply')
  ? 'apply'
  : process.argv.includes('--sql')
    ? 'sql'
    : 'inspect';

const source = new pg.Client({ connectionString: sourceUrl });
await source.connect();
// Belt and braces: even a bug in this file cannot write to the predecessor.
await source.query('BEGIN READ ONLY');

const read = async (sql) => {
  try {
    return (await source.query(sql)).rows;
  } catch {
    return null; // table absent in this vintage of the schema
  }
};

const sources = (await read('SELECT slug, secret_ref, enabled FROM sources')) ?? [];
const routes =
  (await read(
    'SELECT id, source, event_type, transform, config, target_id, enabled FROM routes',
  )) ?? [];
const targets =
  (await read('SELECT id, mode, channel_id, webhook_url_ref, enabled FROM discord_targets')) ?? [];
const roles = (await read('SELECT guild_id, role_id FROM self_assignable_roles')) ?? [];
const reactions =
  (await read('SELECT guild_id, message_id, emoji_key, role_id FROM reaction_role_mappings')) ?? [];
const components =
  (await read('SELECT guild_id, component_key, role_id FROM component_role_bindings')) ?? [];

await source.query('COMMIT');
await source.end();

// ── translate ────────────────────────────────────────────────────────────────────────────
const carried = [];
const left = [];

const targetById = new Map(targets.map((t) => [t.id, t]));

for (const s of sources) {
  carried.push({
    kind: 'source_registration',
    source: s.slug,
    secretRef: s.secret_ref ?? `${s.slug}.signing`,
    enabled: s.enabled,
  });
}

for (const t of targets) {
  if (t.mode === 'bot' && t.channel_id) {
    carried.push({ kind: 'destination', id: t.id, channelRef: t.channel_id });
  } else {
    // A webhook-mode target speaks through a channel webhook URL — which is a FACE, and
    // faces are a later feature. 001 posts as the application via REST, so there is no
    // channel to point at until someone supplies one.
    left.push({
      what: `discord_target ${t.id}`,
      why: 'webhook-mode target — faces are a later feature; needs a channel id to become a destination',
    });
  }
}

for (const r of routes) {
  const target = targetById.get(r.target_id);
  if (!target || target.mode !== 'bot' || !target.channel_id) {
    left.push({
      what: `route ${r.source}/${r.event_type}`,
      why: 'its target is not a channel this feature can post to (see the target above)',
    });
    continue;
  }
  // `excludeSubtypes` was the predecessor's only rule, and it maps exactly onto the new
  // language's `not`/`oneOf` — the same meaning, stated in the one rule language.
  const excluded = r.config?.excludeSubtypes;
  const condition =
    Array.isArray(excluded) && excluded.length > 0
      ? { op: 'not', of: { op: 'oneOf', fact: 'action', values: excluded } }
      : null;
  carried.push({
    kind: 'spell',
    name: `${r.source} ${r.event_type}`,
    source: r.source,
    eventType: r.event_type,
    condition,
    destinationId: target.id,
    transform: r.transform,
  });
}

for (const [rows, what, why] of [
  [roles, 'self-assignable roles', 'roles are charms in a later feature'],
  [reactions, 'reaction-role mappings', 'the ambient-event trigger species is a later feature'],
  [components, 'component-role bindings', 'the interaction trigger species is a later feature'],
]) {
  if (rows.length > 0) left.push({ what: `${rows.length} ${what}`, why });
}

// ── report ───────────────────────────────────────────────────────────────────────────────
console.log(`\nread ${sources.length} sources, ${routes.length} routes, ${targets.length} targets`);
console.log(`\nCARRIES ACROSS (${carried.length})`);
for (const c of carried)
  console.log(`  ${c.kind.padEnd(20)} ${c.source ?? c.channelRef ?? c.name}`);
console.log(`\nDOES NOT CARRY (${left.length})`);
for (const l of left) console.log(`  ${l.what}\n      ${l.why}`);

if (mode === 'inspect') {
  console.log('\n(inspection only — pass --sql to emit statements, --apply to write)\n');
  process.exit(0);
}

// ── emit / apply ─────────────────────────────────────────────────────────────────────────
const tenantName = process.env.TENANT_NAME ?? 'Imported';
const tenantId = randomUUID();
const installId = randomUUID();
const idFor = new Map();
const statements = [
  ['INSERT INTO tenants (id, name) VALUES ($1, $2)', [tenantId, tenantName]],
  [
    `INSERT INTO installs (id, tenant_id, binding, community_ref) VALUES ($1,$2,'discord',$3)`,
    [installId, tenantId, process.env.DISCORD_GUILD_ID ?? 'unknown-guild'],
  ],
];

for (const c of carried) {
  if (c.kind === 'destination') {
    const id = randomUUID();
    idFor.set(c.id, id);
    statements.push([
      'INSERT INTO destinations (id, tenant_id, install_id, channel_ref) VALUES ($1,$2,$3,$4)',
      [id, tenantId, installId, c.channelRef],
    ]);
  } else if (c.kind === 'source_registration') {
    statements.push([
      'INSERT INTO source_registrations (id, tenant_id, source, secret_ref) VALUES ($1,$2,$3,$4)',
      [randomUUID(), tenantId, c.source, c.secretRef],
    ]);
  }
}
for (const c of carried.filter((x) => x.kind === 'spell')) {
  statements.push([
    `INSERT INTO spells (id, tenant_id, name, trigger_species, source, event_type, condition, verb, verb_config)
     VALUES ($1,$2,$3,'external_call',$4,$5,$6,'post_message',$7)`,
    [
      randomUUID(),
      tenantId,
      c.name,
      c.source,
      c.eventType,
      c.condition ? JSON.stringify(c.condition) : null,
      JSON.stringify({
        destinationId: idFor.get(c.destinationId),
        transform: { template: `{repository} — {action}` },
      }),
    ],
  ]);
}

if (mode === 'sql') {
  console.log('\n-- translated statements (values inlined for review; --apply runs them safely)');
  for (const [sql, params] of statements) {
    console.log(
      `${sql.replace(/\s+/g, ' ').trim()};  -- ${params.map((p) => JSON.stringify(p)).join(', ')}`,
    );
  }
  console.log('');
  process.exit(0);
}

const targetUrl = process.env.DATABASE_URL;
if (!targetUrl) {
  console.error('--apply needs DATABASE_URL (the Grimoire database to write into).');
  process.exit(1);
}
const target = new pg.Client({ connectionString: targetUrl });
await target.connect();
await target.query('BEGIN');
try {
  for (const [sql, params] of statements) await target.query(sql, params);
  await target.query('COMMIT');
  console.log(`\napplied ${statements.length} statements as tenant "${tenantName}"\n`);
} catch (error) {
  await target.query('ROLLBACK');
  console.error('apply failed, rolled back:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
await target.end();
