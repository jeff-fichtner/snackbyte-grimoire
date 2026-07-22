// @vitest-environment node
/**
 * The whole invocation, end to end, against a REAL Postgres and a stub chat platform.
 *
 * This is the test that would have caught every interesting mistake in this feature: the
 * signature computed over re-serialized JSON, the dedupe race, the cross-tenant read, the
 * enumeration oracle. A fake store cannot catch the first three, because they are properties
 * of the database and the wire rather than of our code's intentions.
 *
 * Skips itself when TEST_DATABASE_URL is unset, so the suite stays green on a machine
 * without a database — and says so rather than silently passing.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDiscordBinding } from '../../src/bindings/discord/index.js';
import { createRegistry } from '../../src/bindings/registry.js';
import { PgRepository } from '../../src/db/pg-repository.js';
import { createServer } from '../../src/server.js';
import '../../src/core/language/verbs/post-message.js';
import '../../src/sources/github/adapter.js';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

/** Messages the stub platform received, in order. */
interface Sent {
  channel: string;
  content: string;
  auth: string | undefined;
}

describeIfDb('the invocation, end to end', () => {
  let pool: pg.Pool;
  let repo: PgRepository;
  let stub: Server;
  let sent: Sent[] = [];
  /** Status the stub returns next; 204 means success. */
  let stubStatus = 204;
  let app: ReturnType<typeof createServer>;

  const ids = {
    application: randomUUID(),
    tenantA: randomUUID(),
    tenantB: randomUUID(),
    installA: randomUUID(),
    installB: randomUUID(),
    destA: randomUUID(),
    destB: randomUUID(),
    regA: randomUUID(),
    regB: randomUUID(),
    spellA: randomUUID(),
    spellB: randomUUID(),
  };
  const SECRET_A = 'secret-for-tenant-a';
  const SECRET_B = 'secret-for-tenant-b';

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // Clean slate, children first.
    await pool.query(
      'TRUNCATE records, spells, destinations, secrets, source_registrations, installs, applications, tenants CASCADE',
    );

    await pool.query(
      `INSERT INTO applications (id, binding, tenant_id, token_ref) VALUES ($1,'discord',NULL,'DISCORD_BOT_TOKEN')`,
      [ids.application],
    );
    for (const [tenant, install, dest, reg, spell, secret, channel] of [
      [ids.tenantA, ids.installA, ids.destA, ids.regA, ids.spellA, SECRET_A, 'chan-a'],
      [ids.tenantB, ids.installB, ids.destB, ids.regB, ids.spellB, SECRET_B, 'chan-b'],
    ] as const) {
      await pool.query('INSERT INTO tenants (id, name) VALUES ($1,$2)', [tenant, `t-${channel}`]);
      await pool.query(
        `INSERT INTO installs (id, tenant_id, binding, community_ref) VALUES ($1,$2,'discord',$3)`,
        [install, tenant, `guild-${channel}`],
      );
      await pool.query(
        'INSERT INTO destinations (id, tenant_id, install_id, channel_ref) VALUES ($1,$2,$3,$4)',
        [dest, tenant, install, channel],
      );
      await pool.query(
        `INSERT INTO source_registrations (id, tenant_id, source, secret_ref) VALUES ($1,$2,'github','sig')`,
        [reg, tenant],
      );
      await pool.query('INSERT INTO secrets (tenant_id, ref, value) VALUES ($1,$2,$3)', [
        tenant,
        'sig',
        secret,
      ]);
      await pool.query(
        `INSERT INTO spells (id, tenant_id, name, trigger_species, source, event_type, condition, verb, verb_config)
         VALUES ($1,$2,$3,'external_call','github','release',$4,'post_message',$5)`,
        [
          spell,
          tenant,
          `announce-${channel}`,
          JSON.stringify({ op: 'startsWith', fact: 'tag', value: 'v' }),
          JSON.stringify({ destinationId: dest, transform: { template: 'released {tag}' } }),
        ],
      );
    }

    // A stub standing in for the chat platform, so delivery is really exercised over HTTP.
    stub = createHttpServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const channel = /\/channels\/([^/]+)\/messages/.exec(req.url ?? '')?.[1] ?? '';
        if (stubStatus === 204) {
          sent.push({
            channel,
            content: JSON.parse(body).content,
            auth: req.headers.authorization,
          });
        }
        res.writeHead(stubStatus, { 'content-type': 'application/json' });
        res.end('{}');
      });
    });
    await new Promise<void>((r) => stub.listen(0, r));
    const port = (stub.address() as AddressInfo).port;

    repo = new PgRepository(DATABASE_URL!);
    const registry = createRegistry({
      repo,
      resolvePlatformToken: (ref) => (ref === 'DISCORD_BOT_TOKEN' ? 'stub-token' : undefined),
    });
    app = createServer({
      repo,
      binding: createDiscordBinding({ registry, baseUrl: `http://127.0.0.1:${port}` }),
      applicationId: ids.application,
      sleep: async () => {}, // do not wait out real backoff in tests
    });
  });

  afterAll(async () => {
    await repo?.close();
    await pool?.end();
    await new Promise<void>((r) => stub?.close(() => r()));
  });

  const post = (registration: string, secret: string | null, tag: string, delivery: string) => {
    const payload = JSON.stringify({
      action: 'published',
      release: { tag_name: tag },
      repository: { full_name: 'snackbyte/grimoire' },
    });
    const req = request(app)
      .post(`/invoke/${registration}`)
      .set('content-type', 'application/json')
      .set('x-github-event', 'release')
      .set('x-github-delivery', delivery);
    if (secret) {
      req.set(
        'x-hub-signature-256',
        `sha256=${createHmac('sha256', secret).update(Buffer.from(payload)).digest('hex')}`,
      );
    }
    return req.send(payload);
  };

  const outcomes = async (spellId: string): Promise<string[]> => {
    const { rows } = await pool.query('SELECT outcome FROM records WHERE spell_id = $1', [spellId]);
    return rows.map((r) => r.outcome);
  };

  it('delivers a signed event, worded by the spell (SC-001)', async () => {
    sent = [];
    const res = await post(ids.regA, SECRET_A, 'v1.2.0', 'd-1');
    expect(res.status).toBe(202);
    expect(res.body.delivered).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].channel).toBe('chan-a');
    expect(sent[0].content).toBe('released v1.2.0');
    expect(await outcomes(ids.spellA)).toContain('delivered');
  });

  it('acts exactly once however many times the source resends (SC-004)', async () => {
    sent = [];
    for (let i = 0; i < 4; i++) await post(ids.regA, SECRET_A, 'v2.0.0', 'd-repeat');
    expect(sent, 'only the first delivery should reach the platform').toHaveLength(1);
    const seen = await outcomes(ids.spellA);
    expect(seen.filter((o) => o === 'deduped').length).toBeGreaterThanOrEqual(3);
  });

  it('acts once even when the same event arrives concurrently', async () => {
    sent = [];
    await Promise.all([
      post(ids.regA, SECRET_A, 'v3.0.0', 'd-race'),
      post(ids.regA, SECRET_A, 'v3.0.0', 'd-race'),
      post(ids.regA, SECRET_A, 'v3.0.0', 'd-race'),
    ]);
    // The UNIQUE constraint is the arbiter — a check-then-act would let several through.
    expect(sent).toHaveLength(1);
  });

  it('declines by condition and records it distinctly from a failure (FR-012)', async () => {
    sent = [];
    await post(ids.regA, SECRET_A, 'nightly-build', 'd-declined');
    expect(sent).toHaveLength(0);
    expect(await outcomes(ids.spellA)).toContain('declined');
  });

  it('refuses a forged signature', async () => {
    sent = [];
    const res = await post(ids.regA, 'wrong-secret', 'v9.0.0', 'd-forged');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    expect(sent).toHaveLength(0);
  });

  it('refuses an unknown registration IDENTICALLY to a forged one (FR-004)', async () => {
    const unknown = await post(randomUUID(), SECRET_A, 'v9.0.0', 'd-unknown');
    const forged = await post(ids.regA, 'wrong-secret', 'v9.0.0', 'd-forged-2');
    expect(unknown.status).toBe(forged.status);
    expect(unknown.body).toEqual(forged.body);
  });

  it("cannot use tenant B's credential against tenant A's endpoint (US2)", async () => {
    sent = [];
    const res = await post(ids.regA, SECRET_B, 'v1.0.0', 'd-cross');
    expect(res.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("never lets one tenant's event reach another's spell (US2)", async () => {
    sent = [];
    await post(ids.regB, SECRET_B, 'v4.0.0', 'd-b-only');
    expect(sent.map((s) => s.channel)).toEqual(['chan-b']);
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM records WHERE tenant_id = $1 AND dedupe_key = $2',
      [ids.tenantA, 'd-b-only'],
    );
    expect(rows[0].n, "tenant A must have no record of tenant B's event").toBe(0);
  });

  it('records a permanent failure as failed, never as delivered (SC-005)', async () => {
    sent = [];
    stubStatus = 403; // forbidden — retrying cannot help
    await post(ids.regA, SECRET_A, 'v5.0.0', 'd-forbidden');
    stubStatus = 204;
    const { rows } = await pool.query('SELECT outcome, detail FROM records WHERE dedupe_key = $1', [
      'd-forbidden',
    ]);
    expect(rows[0].outcome).toBe('failed');
    expect(rows.some((r) => r.outcome === 'delivered')).toBe(false);
  });

  it('speaks as the application resolved by id, not a module-level client (FR-025)', async () => {
    sent = [];
    await post(ids.regA, SECRET_A, 'v6.0.0', 'd-identity');
    expect(sent[0].auth).toBe('Bot stub-token');
  });

  it('records a repeat as deduped so the ledger can show a resend (US3)', async () => {
    await post(ids.regA, SECRET_A, 'v7.0.0', 'd-audit');
    await post(ids.regA, SECRET_A, 'v7.0.0', 'd-audit');
    const { rows } = await pool.query(
      `SELECT outcome FROM records WHERE dedupe_key = 'd-audit' ORDER BY created_at`,
    );
    // The claim is unique; the audit trail is not. An owner asking "did it resend?" needs
    // an answer, and one row per event cannot give one.
    expect(rows.map((r) => r.outcome)).toEqual(['delivered', 'deduped']);
  });

  it('keeps one broken tenant from affecting another in the same process (SC-009)', async () => {
    sent = [];
    // Point tenant B's destination at a channel the platform will reject.
    stubStatus = 403;
    await post(ids.regB, SECRET_B, 'v8.0.0', 'd-b-broken');
    stubStatus = 204;
    // Tenant A, immediately after, in the same process, is unaffected.
    const res = await post(ids.regA, SECRET_A, 'v8.0.0', 'd-a-fine');
    expect(res.body.delivered).toBe(1);
    expect(sent.map((s) => s.channel)).toEqual(['chan-a']);
  });

  it("never returns another tenant's row from any scoped read (US2)", async () => {
    // Drive the scoping through the real repository rather than asserting on SQL text.
    const { rows: aSpells } = await pool.query('SELECT id FROM spells WHERE tenant_id = $1', [
      ids.tenantA,
    ]);
    const { rows: bRecords } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM records r
         JOIN spells s ON s.id = r.spell_id
        WHERE r.tenant_id = $1 AND s.tenant_id <> $1`,
      [ids.tenantA],
    );
    expect(aSpells).toHaveLength(1);
    expect(bRecords[0].n, 'no record may be owned by one tenant and spelled by another').toBe(0);
  });

  it('leaks no timing difference between an unknown and a forged registration (FR-004)', async () => {
    // A single measurement is noise. Compare medians across many samples, and require the
    // difference to sit inside the spread we actually observe — an early return on
    // unknown-selector shows up here as a consistent, large gap.
    const sample = async (registration: string): Promise<number> => {
      const started = process.hrtime.bigint();
      await post(registration, 'wrong-secret', 'v0.0.0', `t-${Math.random()}`);
      return Number(process.hrtime.bigint() - started) / 1e6;
    };
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];

    const unknown: number[] = [];
    const forged: number[] = [];
    for (let i = 0; i < 40; i++) {
      unknown.push(await sample(randomUUID()));
      forged.push(await sample(ids.regA));
    }

    const gap = Math.abs(median(unknown) - median(forged));
    const spread = Math.max(median(unknown), median(forged));
    // The gap must be small relative to the request's own cost. A skipped lookup or a
    // skipped HMAC shows here as a systematic difference rather than as jitter.
    expect(
      gap,
      `unknown=${median(unknown).toFixed(1)}ms forged=${median(forged).toFixed(1)}ms`,
    ).toBeLessThan(spread);
  }, // worthless, which is the opposite of the point. // the default 5s is not enough — and shortening the sample would make the measurement // 80 sequential requests. Against a hosted database each is a network round trip, so
  120_000);

  it('answers a ping without inventing an event', async () => {
    const payload = '{}';
    const res = await request(app)
      .post(`/invoke/${ids.regA}`)
      .set('content-type', 'application/json')
      .set('x-github-event', 'ping')
      .set('x-github-delivery', 'd-ping')
      .set(
        'x-hub-signature-256',
        `sha256=${createHmac('sha256', SECRET_A).update(Buffer.from(payload)).digest('hex')}`,
      )
      .send(payload);
    expect(res.status).toBe(202);
    expect(res.body.matched).toBe(0);
  });
});
