// @vitest-environment node
/**
 * The Discord binding's face mechanics, against a stub fetch — no network, no real Discord.
 *
 * The properties that matter: establishFace creates a webhook and returns its URL as the
 * credential; send with a face posts THROUGH that credential wearing the persona (and needs
 * no bot token); send without a face still posts as the application; a 403 on establish is a
 * permanent failure (the missing Manage-Webhooks authority); and the credential's field name
 * is redacted so it cannot reach a log line.
 */
import { describe, expect, it } from 'vitest';
import { createDiscordBinding } from '../../src/bindings/discord/index.js';
import { PermanentDeliveryFailure } from '../../src/core/logistics/binding.js';
import { REDACT_PATHS } from '../../src/core/log.js';
import type { Registry, RestClient } from '../../src/bindings/registry.js';

interface Call {
  url: string;
  method: string;
  auth?: string;
  body: unknown;
}

function makeBinding(status = 200, jsonBody: unknown = { id: 'wh1', token: 'wht' }) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      auth: (init.headers as Record<string, string>)?.authorization,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Map() as unknown as Headers,
      json: async () => jsonBody,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  const registry: Registry = {
    getRest: async (applicationId: string): Promise<RestClient> => ({
      applicationId,
      token: 'bot-tok',
    }),
  };
  const binding = createDiscordBinding({ registry, baseUrl: 'https://x/api', fetchImpl });
  return { binding, calls };
}

describe('the discord binding — faces', () => {
  it('establishFace creates a webhook and returns its URL as the credential', async () => {
    const { binding, calls } = makeBinding(200, { id: 'wh1', token: 'wht' });
    const { credential } = await binding.establishFace('app', 'chan-1', 'GitHub');
    expect(calls[0]).toMatchObject({
      url: 'https://x/api/channels/chan-1/webhooks',
      method: 'POST',
      auth: 'Bot bot-tok',
      body: { name: 'GitHub' },
    });
    expect(credential).toBe('https://x/api/webhooks/wh1/wht');
  });

  it('send through a face posts to the credential with the persona and NO bot token', async () => {
    const { binding, calls } = makeBinding(204);
    await binding.send('app', {
      channelRef: 'chan-1',
      content: 'hello',
      face: {
        credential: 'https://x/api/webhooks/wh1/wht',
        username: 'GitHub',
        avatarUrl: 'a.png',
      },
    });
    expect(calls[0]).toMatchObject({
      url: 'https://x/api/webhooks/wh1/wht',
      method: 'POST',
      auth: undefined, // the credential's own token is the authority
      body: { content: 'hello', username: 'GitHub', avatar_url: 'a.png' },
    });
  });

  it('send WITHOUT a face still posts as the application (001 unchanged)', async () => {
    const { binding, calls } = makeBinding(204);
    await binding.send('app', { channelRef: 'chan-1', content: 'hi' });
    expect(calls[0]).toMatchObject({
      url: 'https://x/api/channels/chan-1/messages',
      method: 'POST',
      auth: 'Bot bot-tok',
      body: { content: 'hi' },
    });
  });

  it('a 403 on establishFace is a permanent failure (missing Manage Webhooks)', async () => {
    const { binding } = makeBinding(403);
    await expect(binding.establishFace('app', 'chan-1', 'GitHub')).rejects.toBeInstanceOf(
      PermanentDeliveryFailure,
    );
  });

  it('retireFace treats an already-gone webhook (404) as done', async () => {
    const { binding } = makeBinding(404);
    await expect(binding.retireFace('https://x/api/webhooks/wh1/wht')).resolves.toBeUndefined();
  });

  it('redacts the credential so it cannot reach a log line', () => {
    expect(REDACT_PATHS).toContain('credential');
    expect(REDACT_PATHS).toContain('*.credential');
  });
});
