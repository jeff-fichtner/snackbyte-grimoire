/**
 * The Discord end of the interaction trigger species — the only place a Discord interaction
 * detail appears. It verifies Discord's Ed25519 signature over `timestamp + rawBody`, turns a
 * slash command into a canonical event (options become facts, keyed by the option's own name),
 * and builds the callback JSON. Core sees none of this: `POST /channels/...` never appears, and
 * neither does `type: 4`.
 *
 * Transport is the HTTP interactions endpoint, not the gateway — Discord POSTs each interaction
 * here, which fits a stateless autoscaling service the way a persistent socket never could.
 */
import { createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import type { CanonicalEvent } from '../../core/language/event.js';
import type { InteractionAdapter, ParsedInteraction } from '../../core/logistics/interaction.js';

/** Discord interaction types, and the two option types this slice reads. */
const PING = 1;
const APPLICATION_COMMAND = 2;
const OPTION_USER = 6;
/** Interaction-callback types + the ephemeral flag. */
const PONG = 1;
const CHANNEL_MESSAGE = 4;
const EPHEMERAL = 64;

/** The DER SPKI header for a raw Ed25519 public key — prepend it to the 32 raw bytes. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function obj(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
/** A user's friendly label: global (display) name when set, else the username. */
function displayName(user: Record<string, unknown> | undefined): string | undefined {
  return str(user?.global_name) ?? str(user?.username);
}

export interface DiscordInteractionsDeps {
  /** The application's Ed25519 PUBLIC key (hex), from the Discord developer portal. Not a secret. */
  publicKey: string;
}

export function createDiscordInteractions({
  publicKey,
}: DiscordInteractionsDeps): InteractionAdapter {
  const key: KeyObject = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey, 'hex')]),
    format: 'der',
    type: 'spki',
  });

  return {
    verify(timestamp: string, rawBody: Buffer, signature: string): boolean {
      try {
        const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]);
        return cryptoVerify(null, message, key, Buffer.from(signature, 'hex'));
      } catch {
        return false;
      }
    },

    parse(rawBody: Buffer): ParsedInteraction {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      } catch {
        return { kind: 'ignore' };
      }
      if (payload.type === PING) return { kind: 'ping' };
      if (payload.type !== APPLICATION_COMMAND) return { kind: 'ignore' };

      const data = obj(payload.data);
      const commandName = str(data?.name);
      const guildRef = str(payload.guild_id);
      const dedupeKey = str(payload.id);
      // Guild-only by design: a command with no guild has no tenant to resolve.
      if (!commandName || !guildRef || !dedupeKey) return { kind: 'ignore' };

      const caster = displayName(obj(obj(payload.member)?.user) ?? obj(payload.user));
      const casterId = str(obj(obj(payload.member)?.user)?.id ?? obj(payload.user)?.id);

      const facts: Record<string, string> = {};
      const put = (k: string, v: string | undefined): void => {
        if (v !== undefined) facts[k] = v;
      };
      put('caster', caster);
      put('caster_id', casterId);
      if (casterId) put('caster_mention', `<@${casterId}>`);

      // Every command option becomes a fact keyed by the option's OWN name, so the lines a
      // tenant writes (`{target}`) drive straight off how the command was registered.
      const resolvedUsers = obj(obj(data?.resolved)?.users);
      const options = Array.isArray(data?.options) ? data.options : [];
      for (const raw of options) {
        const opt = obj(raw);
        const name = str(opt?.name);
        if (!name) continue;
        if (opt?.type === OPTION_USER) {
          const id = str(opt.value);
          if (!id) continue;
          put(name, `<@${id}>`); // the mention — a `{target}` that pings
          put(`${name}_id`, id);
          put(`${name}_name`, displayName(obj(resolvedUsers?.[id])));
        } else if (opt?.value !== undefined) {
          put(name, String(opt.value));
        }
      }

      const event: CanonicalEvent = { source: 'discord', eventType: commandName, dedupeKey, facts };
      return { kind: 'command', command: { guildRef, event } };
    },

    pong() {
      return { type: PONG };
    },
    message(content: string) {
      // parse:['users'] lets a `<@id>` in the content ping — but never @everyone/@here/roles.
      return { type: CHANNEL_MESSAGE, data: { content, allowed_mentions: { parse: ['users'] } } };
    },
    ephemeral(content: string) {
      return { type: CHANNEL_MESSAGE, data: { content, flags: EPHEMERAL } };
    },
  };
}
