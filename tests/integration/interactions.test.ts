// @vitest-environment node
/**
 * The interaction door, end to end over the fake store: a signed slash command walks
 * verify → guild→tenant → spell → reply verb, and its rendered line comes back as the
 * synchronous interaction response. The invariants: a bad signature is 401, a PING is answered,
 * an unknown guild gets an ephemeral refusal (never another tenant's spell), and a matched
 * command replies publicly as configured — proving the command walk reuses the same stations as
 * the webhook one, only with a reply for its logistics.
 */
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Binding } from '../../src/core/logistics/binding.js';
import { createDiscordInteractions } from '../../src/bindings/discord/interactions.js';
import { FakeRepository } from '../../src/db/fake-repository.js';
import { createServer } from '../../src/server.js';
// Register the effect primitive the spank spell names.
import '../../src/core/language/verbs/reply-random.js';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyHex = publicKey.export({ type: 'spki', format: 'der' }).subarray(12).toString('hex');

/** Interactions never touch the outbound binding; this exists only to satisfy the type. */
const silentBinding: Binding = {
  key: 'discord',
  send: async () => {},
  establishFace: async () => ({ credential: 'x' }),
  adoptFace: async () => {},
  retireFace: async () => {},
};

function serve() {
  const repo = new FakeRepository({
    installs: [{ tenantId: 'T', binding: 'discord', communityRef: 'guild-42' }],
    spells: [
      {
        id: 's1',
        tenantId: 'T',
        name: 'spank',
        triggerSpecies: 'interaction',
        source: 'discord',
        eventType: 'spank',
        condition: null,
        verb: 'reply_random',
        verbConfig: { lines: ['🍑 {caster} spanks {target}!'] },
      },
    ],
  });
  const interactions = createDiscordInteractions({ publicKey: publicKeyHex });
  return createServer({ repo, binding: silentBinding, applicationId: 'app', interactions });
}

function post(app: ReturnType<typeof serve>, payload: object, opts: { sign?: boolean } = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  const ts = '1700000000';
  const sig =
    opts.sign === false
      ? 'deadbeef'
      : edSign(null, Buffer.concat([Buffer.from(ts), body]), privateKey).toString('hex');
  return request(app)
    .post('/interactions')
    .set('x-signature-ed25519', sig)
    .set('x-signature-timestamp', ts)
    .set('content-type', 'application/json')
    .send(body.toString('utf8')); // a string, so supertest transmits the exact bytes we signed
}

const spankCommand = {
  id: 'i-1',
  type: 2,
  guild_id: 'guild-42',
  member: { user: { id: 'c1', global_name: 'Jeff' } },
  data: {
    name: 'spank',
    type: 1,
    options: [{ name: 'target', type: 6, value: 't9' }],
    resolved: { users: { t9: { id: 't9', global_name: 'Butch' } } },
  },
};

describe('POST /interactions', () => {
  it('runs a matched command and replies publicly with the rendered line', async () => {
    const res = await post(serve(), spankCommand);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      type: 4,
      data: { content: '🍑 Jeff spanks <@t9>!', allowed_mentions: { parse: ['users'] } },
    });
  });

  it('answers a PING handshake', async () => {
    const res = await post(serve(), { type: 1 });
    expect(res.body).toEqual({ type: 1 });
  });

  it('rejects a bad signature with 401 before doing any work', async () => {
    const res = await post(serve(), spankCommand, { sign: false });
    expect(res.status).toBe(401);
  });

  it('refuses an unknown guild ephemerally — never reaches a spell', async () => {
    const res = await post(serve(), { ...spankCommand, guild_id: 'guild-999' });
    expect(res.status).toBe(200);
    expect(res.body.data.flags).toBe(64); // ephemeral
    expect(res.body.data.content).not.toContain('spanks');
  });

  it('503s when no interaction surface is configured', async () => {
    const repo = new FakeRepository();
    const app = createServer({ repo, binding: silentBinding, applicationId: 'app' });
    const res = await request(app).post('/interactions').send({ type: 1 });
    expect(res.status).toBe(503);
  });
});
