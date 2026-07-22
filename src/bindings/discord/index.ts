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
  return {
    key: 'discord',

    async send(applicationId: string, message: OutboundMessage): Promise<void> {
      const client = await registry.getRest(applicationId);

      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/channels/${message.channelRef}/messages`, {
          method: 'POST',
          headers: {
            authorization: `Bot ${client.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ content: message.content }),
        });
      } catch (error) {
        // No status at all — the network, not the platform. Worth retrying.
        throw new TransientDeliveryFailure(
          error instanceof Error ? error.message : 'network failure',
        );
      }

      if (response.ok) return;

      if (response.status === 429 || response.status >= 500) {
        const header = response.headers.get('retry-after');
        const retryAfterSeconds = header ? Number(header) : undefined;
        throw new TransientDeliveryFailure(
          `discord responded ${response.status}`,
          Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
        );
      }

      // 401 revoked, 403 forbidden, 404 gone — and any other 4xx is a request we should not
      // repeat. Retrying cannot change the answer.
      throw new PermanentDeliveryFailure(`discord responded ${response.status}`, response.status);
    },
  };
}
