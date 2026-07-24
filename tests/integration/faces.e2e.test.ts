// @vitest-environment node
/**
 * Faces, end to end, against a REAL Postgres and a stub Discord (channels AND webhooks).
 *
 * This is where the properties that a fake cannot prove get proven: that a message really
 * travels out through a webhook wearing the face's name; that two faces share one webhook;
 * that a cross-tenant faceId is refused by the database's scoping; that a deleted face's next
 * invocation is recorded FAILED, not delivered; and that establishing a face without the
 * management authority fails closed, writing no row.
 *
 * Skips when TEST_DATABASE_URL is unset.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDiscordBinding } from '../../src/bindings/discord/index.js';
import { createRegistry } from '../../src/bindings/registry.js';
import { type TenantRef, tenantFromVerifiedCall } from '../../src/core/law/tenant-ref.js';
import { adoptFace, deleteFace, mintFace, renameFace } from '../../src/core/nouns/faces.js';
import { PgRepository } from '../../src/db/pg-repository.js';
import { createServer } from '../../src/server.js';
import '../../src/core/language/verbs/post-message.js';
import '../../src/sources/github/adapter.js';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

interface Posted {
  kind: 'message' | 'webhook';
  target: string; // channel id, or webhook id
  content: string;
  username?: string;
  avatar?: string;
}

describeIfDb('faces, end to end', () => {
  let pool: pg.Pool;
  let repo: PgRepository;
  let stub: Server;
  let app: ReturnType<typeof createServer>;
  let posted: Posted[] = [];
  /** Webhook ids the stub still considers live (retire removes one). */
  let liveWebhooks: Set<string>;
  /** Force the next webhook-create to fail (missing Manage Webhooks). */
  let denyEstablish = false;
  let webhookSeq = 0;

  const ids = {
    application: randomUUID(),
    tenantA: randomUUID(),
    tenantB: randomUUID(),
    installA: randomUUID(),
    installB: randomUUID(),
    regA: randomUUID(),
    regB: randomUUID(),
  };
  const SECRET = 'sig-secret';
  let refA: TenantRef;
  let refB: TenantRef;
  let binding: ReturnType<typeof createDiscordBinding>;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await pool.query(
      'TRUNCATE records, faces, spells, destinations, secrets, source_registrations, installs, applications, tenants CASCADE',
    );
    await pool.query(
      `INSERT INTO applications (id, binding, tenant_id, token_ref) VALUES ($1,'discord',NULL,'DISCORD_BOT_TOKEN')`,
      [ids.application],
    );
    for (const [tenant, install, reg, guild] of [
      [ids.tenantA, ids.installA, ids.regA, 'guild-a'],
      [ids.tenantB, ids.installB, ids.regB, 'guild-b'],
    ] as const) {
      await pool.query('INSERT INTO tenants (id, name) VALUES ($1,$2)', [tenant, guild]);
      await pool.query(
        `INSERT INTO installs (id, tenant_id, binding, community_ref) VALUES ($1,$2,'discord',$3)`,
        [install, tenant, guild],
      );
      await pool.query(
        `INSERT INTO source_registrations (id, tenant_id, source, secret_ref) VALUES ($1,$2,'github','sig')`,
        [reg, tenant],
      );
      await pool.query('INSERT INTO secrets (tenant_id, ref, value) VALUES ($1,$2,$3)', [
        tenant,
        'sig',
        SECRET,
      ]);
    }
    refA = tenantFromVerifiedCall({
      registrationId: ids.regA,
      tenantId: ids.tenantA,
      source: 'github',
      signatureVerified: true,
    });
    refB = tenantFromVerifiedCall({
      registrationId: ids.regB,
      tenantId: ids.tenantB,
      source: 'github',
      signatureVerified: true,
    });

    liveWebhooks = new Set<string>();
    stub = createHttpServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const url = req.url ?? '';
        const method = req.method ?? 'GET';
        const parsed = body ? JSON.parse(body) : {};

        // Create a webhook (establish a face's credential).
        const createM = /\/channels\/([^/]+)\/webhooks$/.exec(url);
        if (createM && method === 'POST') {
          if (denyEstablish) {
            res.writeHead(403).end('{}');
            return;
          }
          const id = `wh-${++webhookSeq}`;
          liveWebhooks.add(id);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id, token: `tok-${id}` }));
          return;
        }

        // Execute / inspect / retire a webhook.
        const whM = /\/webhooks\/([^/]+)\/([^/]+)$/.exec(url);
        if (whM) {
          const id = whM[1];
          if (!liveWebhooks.has(id)) {
            res.writeHead(404).end('{}'); // retired or unknown — permanent
            return;
          }
          if (method === 'DELETE') {
            liveWebhooks.delete(id);
            res.writeHead(204).end('{}');
            return;
          }
          if (method === 'GET') {
            res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id }));
            return;
          }
          // POST — speak through the face.
          posted.push({
            kind: 'webhook',
            target: id,
            content: parsed.content,
            username: parsed.username,
            avatar: parsed.avatar_url,
          });
          res.writeHead(204).end('{}');
          return;
        }

        // Post as the application.
        const msgM = /\/channels\/([^/]+)\/messages$/.exec(url);
        if (msgM && method === 'POST') {
          posted.push({ kind: 'message', target: msgM[1], content: parsed.content });
          res.writeHead(204).end('{}');
          return;
        }
        res.writeHead(204).end('{}');
      });
    });
    await new Promise<void>((r) => stub.listen(0, r));
    const port = (stub.address() as AddressInfo).port;
    repo = new PgRepository(DATABASE_URL!);
    const registry = createRegistry({
      repo,
      resolvePlatformToken: (ref) => (ref === 'DISCORD_BOT_TOKEN' ? 'stub-token' : undefined),
    });
    binding = createDiscordBinding({ registry, baseUrl: `http://127.0.0.1:${port}` });
    app = createServer({ repo, binding, applicationId: ids.application, sleep: async () => {} });
  });

  afterAll(async () => {
    await repo?.close();
    await pool?.end();
    await new Promise<void>((r) => stub?.close(() => r()));
  });

  beforeEach(async () => {
    posted = [];
    denyEstablish = false;
    liveWebhooks.clear();
    // Each test starts with no spells/faces/records so one fire triggers only its own spell.
    await pool.query('TRUNCATE records, faces, spells CASCADE');
    await pool.query(`DELETE FROM secrets WHERE ref LIKE 'face-webhook.%'`);
  });

  // Seed a spell that speaks through a face, unique per test via its delivery keys.
  const seedFaceSpell = async (tenant: string, faceId: string): Promise<string> => {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO spells (id, tenant_id, name, trigger_species, source, event_type, condition, verb, verb_config)
       VALUES ($1,$2,$3,'external_call','github','release',NULL,'post_message',$4)`,
      [
        id,
        tenant,
        `via face ${id.slice(0, 8)}`,
        JSON.stringify({ faceId, transform: { template: 'released {tag}' } }),
      ],
    );
    return id;
  };

  const fire = (reg: string, delivery: string, secret = SECRET) => {
    const payload = JSON.stringify({
      action: 'published',
      release: { tag_name: 'v9.9.9' },
      repository: { full_name: 'snackbyte/grimoire' },
    });
    return request(app)
      .post(`/invoke/${reg}`)
      .set('content-type', 'application/json')
      .set('x-github-event', 'release')
      .set('x-github-delivery', delivery)
      .set(
        'x-hub-signature-256',
        `sha256=${createHmac('sha256', secret).update(Buffer.from(payload)).digest('hex')}`,
      )
      .send(payload);
  };

  const outcomesFor = async (spellId: string): Promise<string[]> => {
    const { rows } = await pool.query('SELECT outcome FROM records WHERE spell_id = $1', [spellId]);
    return rows.map((r) => r.outcome);
  };

  // ── US1 — mint + speak ────────────────────────────────────────────────────────────────
  it('mints a face and a spell speaks through it, under the face name (US1)', async () => {
    const face = await mintFace({ repo, binding, applicationId: ids.application }, refA, {
      installId: ids.installA,
      channelRef: 'chan-1',
      name: 'GitHub',
      avatarUrl: 'g.png',
    });
    const spell = await seedFaceSpell(ids.tenantA, face.id);
    const res = await fire(ids.regA, 'd-us1');
    expect(res.body.delivered).toBe(1);
    expect(await outcomesFor(spell)).toContain('delivered');
    const wh = posted.find((p) => p.kind === 'webhook');
    expect(wh?.content).toBe('released v9.9.9');
    expect(wh?.username).toBe('GitHub');
    expect(wh?.avatar).toBe('g.png');
  });

  it('two faces in one channel share ONE webhook (US1 · FR-010)', async () => {
    const before = webhookSeq;
    await mintFace({ repo, binding, applicationId: ids.application }, refA, {
      installId: ids.installA,
      channelRef: 'chan-share',
      name: 'GitHub',
    });
    await mintFace({ repo, binding, applicationId: ids.application }, refA, {
      installId: ids.installA,
      channelRef: 'chan-share',
      name: 'ClickUp',
    });
    expect(webhookSeq - before, 'exactly one webhook established for the channel').toBe(1);
  });

  it('rename takes effect on the next message (US1 · FR-014)', async () => {
    const face = await mintFace({ repo, binding, applicationId: ids.application }, refA, {
      installId: ids.installA,
      channelRef: 'chan-rename',
      name: 'GitHub',
    });
    const spell = await seedFaceSpell(ids.tenantA, face.id);
    await renameFace({ repo, binding, applicationId: ids.application }, refA, face.id, {
      name: 'GitHub CI',
    });
    await fire(ids.regA, 'd-rename');
    expect(await outcomesFor(spell)).toContain('delivered');
    expect(posted.find((p) => p.kind === 'webhook')?.username).toBe('GitHub CI');
  });

  it('mint without the management authority fails, writing no row (US1 · FR-002)', async () => {
    denyEstablish = true;
    const before = await repo.countChannelFaces(refA, ids.installA, 'chan-deny');
    await expect(
      mintFace({ repo, binding, applicationId: ids.application }, refA, {
        installId: ids.installA,
        channelRef: 'chan-deny',
        name: 'GitHub',
      }),
    ).rejects.toBeTruthy();
    expect(await repo.countChannelFaces(refA, ids.installA, 'chan-deny')).toBe(before);
  });

  // ── US2 — isolation ───────────────────────────────────────────────────────────────────
  it("a tenant cannot speak through another tenant's face, and it is recorded failed (US2)", async () => {
    const bFace = await mintFace({ repo, binding, applicationId: ids.application }, refB, {
      installId: ids.installB,
      channelRef: 'chan-b',
      name: 'B face',
    });
    // Tenant A's spell names B's faceId.
    const spell = await seedFaceSpell(ids.tenantA, bFace.id);
    const res = await fire(ids.regA, 'd-cross');
    expect(res.body.delivered).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(await outcomesFor(spell)).toContain('failed');
    expect(
      posted.find((p) => p.kind === 'webhook'),
      'nothing posted',
    ).toBeUndefined();
  });

  it('listFaces is tenant-scoped and carries no credential (US2 · FR-006/013)', async () => {
    await mintFace({ repo, binding, applicationId: ids.application }, refA, {
      installId: ids.installA,
      channelRef: 'chan-a',
      name: 'A face',
    });
    await mintFace({ repo, binding, applicationId: ids.application }, refB, {
      installId: ids.installB,
      channelRef: 'chan-b',
      name: 'B face',
    });
    const list = await repo.listFaces(refA);
    expect(list.length).toBe(1);
    expect(
      list.every((f) => f.channelRef !== 'chan-b'),
      'never sees B',
    ).toBe(true);
    expect(
      list.every((f) => !('credential' in f)),
      'no credential in a listing',
    ).toBe(true);
  });

  // ── US3 — revoke, honest record ───────────────────────────────────────────────────────
  it('deleting a face a spell uses records the next invocation FAILED, not delivered (US3)', async () => {
    const face = await mintFace({ repo, binding, applicationId: ids.application }, refA, {
      installId: ids.installA,
      channelRef: 'chan-del',
      name: 'GitHub',
    });
    const spell = await seedFaceSpell(ids.tenantA, face.id);
    await fire(ids.regA, 'd-del-1');
    expect(
      posted.some((p) => p.kind === 'webhook'),
      'delivered before delete',
    ).toBe(true);

    await deleteFace({ repo, binding, applicationId: ids.application }, refA, face.id);
    posted = [];
    const res = await fire(ids.regA, 'd-del-2');
    expect(res.body.failed).toBe(1);
    expect(res.body.delivered).toBe(0);
    expect(await outcomesFor(spell)).toContain('failed');
    expect(
      posted.find((p) => p.kind === 'webhook'),
      'nothing posted after delete',
    ).toBeUndefined();
  });

  // ── US4 — adopt ───────────────────────────────────────────────────────────────────────
  it('adopts a supplied webhook and speaks under the persona (US4)', async () => {
    // A pre-existing webhook the stub already knows about.
    liveWebhooks.add('wh-supplied');
    const port = (stub.address() as AddressInfo).port;
    const supplied = `http://127.0.0.1:${port}/webhooks/wh-supplied/tok`;
    const face = await adoptFace({ repo, binding, applicationId: ids.application }, refA, {
      installId: ids.installA,
      channelRef: 'chan-adopt',
      name: 'miss honey',
      suppliedCredential: supplied,
    });
    expect(face.origin).toBe('adopted');
    const spell = await seedFaceSpell(ids.tenantA, face.id);
    const res = await fire(ids.regA, 'd-adopt');
    expect(res.body.delivered).toBe(1);
    expect(await outcomesFor(spell)).toContain('delivered');
    const wh = posted.find((p) => p.kind === 'webhook' && p.target === 'wh-supplied');
    expect(wh?.username).toBe('miss honey');
  });
});
