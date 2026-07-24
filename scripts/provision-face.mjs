/**
 * Provision faces — the operator path, mirroring seed-prod.mjs.
 *
 * A face is a community-owned persona; a channel's faces share ONE webhook whose URL is a
 * credential kept in the secret store (never printed, never a face-row column). This script
 * does over raw SQL + the Discord API exactly what src/core/nouns/faces.ts does in the running
 * service — mint (the default, safe path), adopt (explicit, non-default), list, rename, delete.
 *
 * Every required value comes from the environment with NO fallback — a missing one fails loudly.
 *
 * Usage:
 *   DATABASE_URL=… DISCORD_BOT_TOKEN=… TENANT_NAME="…" DISCORD_CHANNEL_ID=… FACE_NAME="GitHub" \
 *     [FACE_AVATAR_URL=…]  node scripts/provision-face.mjs mint
 *   … ADOPT_WEBHOOK_URL="https://discord.com/api/webhooks/…"  node scripts/provision-face.mjs adopt
 *   DATABASE_URL=… TENANT_NAME="…"  node scripts/provision-face.mjs list
 *   … FACE_ID=…  FACE_NAME="New"  node scripts/provision-face.mjs rename
 *   DATABASE_URL=… DISCORD_BOT_TOKEN=… TENANT_NAME="…" FACE_ID=…  node scripts/provision-face.mjs delete
 */
import pg from 'pg';

const DISCORD_API = 'https://discord.com/api/v10';

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    console.error(`REFUSING: ${name} is not set. A face operation guesses nothing.`);
    process.exit(1);
  }
  return value;
}

const command = process.argv[2];
if (!['mint', 'adopt', 'list', 'rename', 'delete'].includes(command ?? '')) {
  console.error('usage: node scripts/provision-face.mjs <mint|adopt|list|rename|delete>');
  process.exit(2);
}

const client = new pg.Client({ connectionString: required('DATABASE_URL') });
await client.connect();

/** Resolve tenant + its discord install. Fails loudly if either is missing. */
async function resolveTenantInstall(tenantName) {
  const t = await client.query('SELECT id FROM tenants WHERE name = $1', [tenantName]);
  if (t.rowCount === 0) {
    console.error(`no tenant named "${tenantName}"`);
    process.exit(1);
  }
  const tenantId = t.rows[0].id;
  const i = await client.query(
    `SELECT id FROM installs WHERE tenant_id = $1 AND binding = 'discord' LIMIT 1`,
    [tenantId],
  );
  if (i.rowCount === 0) {
    console.error(`tenant "${tenantName}" has no discord install`);
    process.exit(1);
  }
  return { tenantId, installId: i.rows[0].id };
}

const channelSecretRef = (channelRef) => `face-webhook.${channelRef}`;

async function discord(method, path, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bot ${token}`;
  const res = await fetch(path.startsWith('http') ? path : `${DISCORD_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

/** Establish (or reuse) the channel's credential; store it as a secret. Returns the secret ref. */
async function ensureCredential(tenantId, installId, channelRef, produce) {
  const ref = channelSecretRef(channelRef);
  const count = await client.query(
    `SELECT count(*)::int AS n FROM faces WHERE tenant_id=$1 AND install_id=$2 AND channel_ref=$3`,
    [tenantId, installId, channelRef],
  );
  if (count.rows[0].n === 0) {
    const credential = await produce();
    await client.query(
      `INSERT INTO secrets (tenant_id, ref, value) VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, ref) DO UPDATE SET value = EXCLUDED.value`,
      [tenantId, ref, credential],
    );
  }
  return ref;
}

async function insertFace(tenantId, installId, channelRef, name, avatarUrl, secretRef, origin) {
  const { rows } = await client.query(
    `INSERT INTO faces (tenant_id, install_id, channel_ref, name, avatar_url, secret_ref, origin)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [tenantId, installId, channelRef, name, avatarUrl ?? null, secretRef, origin],
  );
  return rows[0].id;
}

try {
  if (command === 'mint' || command === 'adopt') {
    const { tenantId, installId } = await resolveTenantInstall(required('TENANT_NAME'));
    const channelRef = required('DISCORD_CHANNEL_ID');
    const name = required('FACE_NAME');
    const avatarUrl = process.env.FACE_AVATAR_URL ?? null;

    const secretRef = await ensureCredential(tenantId, installId, channelRef, async () => {
      if (command === 'adopt') {
        // Explicit, non-default: the operator supplies the credential on purpose.
        const supplied = required('ADOPT_WEBHOOK_URL');
        const check = await discord('GET', supplied);
        if (!check.ok) {
          console.error(`supplied webhook is not reachable (HTTP ${check.status})`);
          process.exit(1);
        }
        return supplied;
      }
      // Mint — the default. Establish the channel's webhook (needs Manage Webhooks).
      const token = required('DISCORD_BOT_TOKEN');
      const res = await discord('POST', `/channels/${channelRef}/webhooks`, {
        token,
        body: { name },
      });
      if (!res.ok) {
        console.error(
          res.status === 403
            ? `cannot mint: the bot lacks Manage Webhooks in this channel (HTTP 403). Re-invite it with that permission.`
            : `mint failed (HTTP ${res.status})`,
        );
        process.exit(1);
      }
      const wh = await res.json();
      return `${DISCORD_API}/webhooks/${wh.id}/${wh.token}`;
    });

    const origin = command === 'adopt' ? 'adopted' : 'minted';
    const faceId = await insertFace(
      tenantId,
      installId,
      channelRef,
      name,
      avatarUrl,
      secretRef,
      origin,
    );
    console.log(`\n${command === 'adopt' ? 'adopted' : 'minted'} face "${name}"`);
    console.log(`  faceId  ${faceId}`);
    console.log(`  channel ${channelRef}  (credential stored, never printed)\n`);
  } else if (command === 'list') {
    const { tenantId } = await resolveTenantInstall(required('TENANT_NAME'));
    const { rows } = await client.query(
      `SELECT id, channel_ref, name, avatar_url, origin FROM faces WHERE tenant_id=$1 ORDER BY created_at`,
      [tenantId],
    );
    console.log(`\n${rows.length} face(s) — no credential is ever shown:`);
    for (const r of rows) {
      console.log(
        `  ${r.name.padEnd(16)} channel=${r.channel_ref}  origin=${r.origin}  id=${r.id}`,
      );
    }
    console.log('');
  } else if (command === 'rename') {
    const { tenantId } = await resolveTenantInstall(required('TENANT_NAME'));
    const faceId = required('FACE_ID');
    // Row-only: name/avatar are per-message overrides, so the next message wears the change.
    await client.query(
      `UPDATE faces
          SET name = COALESCE($3, name),
              avatar_url = COALESCE($4, avatar_url)
        WHERE id=$1 AND tenant_id=$2`,
      [faceId, tenantId, process.env.FACE_NAME ?? null, process.env.FACE_AVATAR_URL ?? null],
    );
    console.log(`renamed face ${faceId}`);
  } else if (command === 'delete') {
    const { tenantId } = await resolveTenantInstall(required('TENANT_NAME'));
    const faceId = required('FACE_ID');
    const face = await client.query(
      `SELECT install_id, channel_ref, secret_ref FROM faces WHERE id=$1 AND tenant_id=$2`,
      [faceId, tenantId],
    );
    if (face.rowCount === 0) {
      console.log('no such face for this tenant — nothing to do');
    } else {
      const { install_id, channel_ref, secret_ref } = face.rows[0];
      await client.query('DELETE FROM faces WHERE id=$1 AND tenant_id=$2', [faceId, tenantId]);
      const remaining = await client.query(
        `SELECT count(*)::int AS n FROM faces WHERE tenant_id=$1 AND install_id=$2 AND channel_ref=$3`,
        [tenantId, install_id, channel_ref],
      );
      if (remaining.rows[0].n === 0) {
        // Last face in the channel — retire the credential.
        const sec = await client.query('SELECT value FROM secrets WHERE tenant_id=$1 AND ref=$2', [
          tenantId,
          secret_ref,
        ]);
        if (sec.rowCount > 0) await discord('DELETE', sec.rows[0].value);
        await client.query('DELETE FROM secrets WHERE tenant_id=$1 AND ref=$2', [
          tenantId,
          secret_ref,
        ]);
        console.log(`deleted face ${faceId} and retired the channel's webhook (it was the last)`);
      } else {
        console.log(
          `deleted face ${faceId} (${remaining.rows[0].n} face(s) still share the webhook)`,
        );
      }
    }
  }
} catch (error) {
  console.error('operation failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
