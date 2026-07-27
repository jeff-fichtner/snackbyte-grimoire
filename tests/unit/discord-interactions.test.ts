// @vitest-environment node
/**
 * The Discord interaction adapter: Ed25519 verification over the exact `timestamp + body` bytes,
 * and the normalization of a slash command into a canonical event whose facts are keyed by each
 * option's own name. The security property that matters: a tampered body or a wrong signature
 * fails closed, so a forged interaction cannot reach a tenant's spells.
 */
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDiscordInteractions } from '../../src/bindings/discord/interactions.js';

// A throwaway Ed25519 keypair standing in for a Discord application's.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyHex = publicKey.export({ type: 'spki', format: 'der' }).subarray(12).toString('hex');
const adapter = createDiscordInteractions({ publicKey: publicKeyHex });

function signed(timestamp: string, body: Buffer): string {
  return edSign(null, Buffer.concat([Buffer.from(timestamp), body]), privateKey).toString('hex');
}

const commandPayload = Buffer.from(
  JSON.stringify({
    id: 'interaction-1',
    type: 2,
    guild_id: 'guild-42',
    member: { user: { id: 'caster-1', username: 'jeff', global_name: 'Jeff' } },
    data: {
      name: 'spank',
      type: 1,
      options: [{ name: 'target', type: 6, value: 'target-9' }],
      resolved: {
        users: { 'target-9': { id: 'target-9', username: 'butch', global_name: 'Butch' } },
      },
    },
  }),
);

describe('discord interaction adapter — verify', () => {
  it('accepts a correctly signed request', () => {
    const ts = '1700000000';
    expect(adapter.verify(ts, commandPayload, signed(ts, commandPayload))).toBe(true);
  });

  it('rejects a tampered body', () => {
    const ts = '1700000000';
    const sig = signed(ts, commandPayload);
    expect(adapter.verify(ts, Buffer.from(commandPayload.toString() + ' '), sig)).toBe(false);
  });

  it('rejects a garbage signature without throwing', () => {
    expect(adapter.verify('1700000000', commandPayload, 'not-hex-zzz')).toBe(false);
    expect(adapter.verify('1700000000', commandPayload, 'ab')).toBe(false);
  });
});

describe('discord interaction adapter — parse', () => {
  it('normalizes a slash command, keying facts by the option name', () => {
    const parsed = adapter.parse(commandPayload);
    expect(parsed.kind).toBe('command');
    if (parsed.kind !== 'command') return;
    expect(parsed.command.guildRef).toBe('guild-42');
    expect(parsed.command.event).toMatchObject({
      source: 'discord',
      eventType: 'spank',
      dedupeKey: 'interaction-1',
    });
    expect(parsed.command.event.facts).toMatchObject({
      caster: 'Jeff',
      caster_mention: '<@caster-1>',
      target: '<@target-9>', // a mention that pings
      target_id: 'target-9',
      target_name: 'Butch',
    });
  });

  it('answers a PING as a ping', () => {
    expect(adapter.parse(Buffer.from(JSON.stringify({ type: 1 }))).kind).toBe('ping');
  });

  it('ignores a non-command interaction and a guildless command', () => {
    expect(adapter.parse(Buffer.from(JSON.stringify({ type: 3 }))).kind).toBe('ignore');
    expect(
      adapter.parse(Buffer.from(JSON.stringify({ id: 'x', type: 2, data: { name: 'spank' } })))
        .kind,
    ).toBe('ignore');
    expect(adapter.parse(Buffer.from('not json')).kind).toBe('ignore');
  });

  it('builds a pong, a public message, and an ephemeral answer', () => {
    expect(adapter.pong()).toEqual({ type: 1 });
    expect(adapter.message('hi')).toEqual({
      type: 4,
      data: { content: 'hi', allowed_mentions: { parse: ['users'] } },
    });
    expect(adapter.ephemeral('nope')).toEqual({ type: 4, data: { content: 'nope', flags: 64 } });
  });
});
