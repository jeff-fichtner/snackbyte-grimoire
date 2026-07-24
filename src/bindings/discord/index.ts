/**
 * The Discord binding — the only place a Discord API detail appears.
 *
 * It obtains its client from `getRest(applicationId)` and holds no module-level client, so
 * a second application is a row rather than an edit here.
 *
 * The permanent-vs-transient classification is lifted from the predecessor, where it was
 * earned against the live API: 401/403/404 cannot succeed on retry, while 429 and 5xx and
 * bare network errors can. Retrying a 403 forever is the classic version of getting this
 * wrong, and re-deriving it from memory is how it comes back.
 *
 * Faces are Discord channel webhooks: `establishFace` creates one, `send` posts through it
 * with a per-message username/avatar (so one webhook wears every face), `retireFace` deletes
 * it. This is the ONLY file that says "webhook" — core names the capability "face".
 */
import {
  type Binding,
  type OutboundMessage,
  PermanentDeliveryFailure,
  TransientDeliveryFailure,
} from '../../core/logistics/binding.js';
import type { Registry } from '../registry.js';

export interface DiscordDeps {
  registry: Registry;
  /** Overridable so tests can point at a local stub instead of the real API. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export function createDiscordBinding({
  registry,
  baseUrl = 'https://discord.com/api/v10',
  fetchImpl = fetch,
}: DiscordDeps): Binding {
  /** One classification for every Discord response — see the file header. */
  function classify(response: Response): void {
    if (response.ok) return;
    if (response.status === 429 || response.status >= 500) {
      const header = response.headers.get('retry-after');
      const retryAfterSeconds = header ? Number(header) : undefined;
      throw new TransientDeliveryFailure(
        `discord responded ${response.status}`,
        Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
      );
    }
    // 401 revoked, 403 forbidden, 404 gone — and any other 4xx we should not repeat.
    throw new PermanentDeliveryFailure(`discord responded ${response.status}`, response.status);
  }

  async function call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetchImpl(url, init);
    } catch (error) {
      // No status at all — the network, not the platform. Worth retrying.
      throw new TransientDeliveryFailure(
        error instanceof Error ? error.message : 'network failure',
      );
    }
  }

  return {
    key: 'discord',

    async send(applicationId: string, message: OutboundMessage): Promise<void> {
      // Through a face: post to the webhook credential with the per-message persona. No bot
      // token needed — the credential's token is its own authority.
      if (message.face) {
        const response = await call(message.face.credential, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content: message.content,
            username: message.face.username,
            avatar_url: message.face.avatarUrl,
          }),
        });
        classify(response);
        return;
      }

      // As the application: post to the channel as the bot.
      const client = await registry.getRest(applicationId);
      const response = await call(`${baseUrl}/channels/${message.channelRef}/messages`, {
        method: 'POST',
        headers: { authorization: `Bot ${client.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ content: message.content }),
      });
      classify(response);
    },

    async establishFace(applicationId, channelRef, name): Promise<{ credential: string }> {
      const client = await registry.getRest(applicationId);
      const response = await call(`${baseUrl}/channels/${channelRef}/webhooks`, {
        method: 'POST',
        headers: { authorization: `Bot ${client.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      // A 403 here is the missing Manage-Webhooks authority — a clear, permanent failure, not
      // a silent success (FR-002).
      classify(response);
      const webhook = (await response.json()) as { id: string; token: string };
      return { credential: `${baseUrl}/webhooks/${webhook.id}/${webhook.token}` };
    },

    async adoptFace(credential): Promise<void> {
      // A supplied credential proves nothing until we confirm it is a real, reachable webhook.
      const response = await call(credential, { method: 'GET' });
      classify(response);
    },

    async retireFace(credential): Promise<void> {
      const response = await call(credential, { method: 'DELETE' });
      // A webhook already gone is a fine outcome for retirement — treat 404 as done.
      if (response.status === 404) return;
      classify(response);
    },
  };
}
