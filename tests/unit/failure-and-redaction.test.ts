// @vitest-environment node
/**
 * Two guards that protect against silent wrongness rather than crashes.
 *
 * The classification decides whether we hammer a platform that will never say yes; the
 * redaction decides whether a credential ends up in a log line someone later pastes into a
 * ticket. Neither failure announces itself.
 */
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createDiscordBinding } from '../../src/bindings/discord/index.js';
import {
  PermanentDeliveryFailure,
  TransientDeliveryFailure,
} from '../../src/core/logistics/binding.js';
import { REDACT_PATHS } from '../../src/core/log.js';

const registry = {
  getRest: async (applicationId: string) => ({ applicationId, token: 'tok' }),
};

const bindingReturning = (status: number, headers: Record<string, string> = {}) =>
  createDiscordBinding({
    registry,
    fetchImpl: (async () =>
      new Response(status === 204 ? null : '{}', { status, headers })) as typeof fetch,
  });

describe('permanent vs transient', () => {
  it.each([401, 403, 404, 400])('treats %i as permanent — retrying cannot help', async (status) => {
    await expect(
      bindingReturning(status).send('app-1', { channelRef: 'c', content: 'x' }),
    ).rejects.toBeInstanceOf(PermanentDeliveryFailure);
  });

  it.each([429, 500, 502, 503])('treats %i as transient', async (status) => {
    await expect(
      bindingReturning(status).send('app-1', { channelRef: 'c', content: 'x' }),
    ).rejects.toBeInstanceOf(TransientDeliveryFailure);
  });

  it("honours the platform's own Retry-After rather than guessing", async () => {
    try {
      await bindingReturning(429, { 'retry-after': '7' }).send('app-1', {
        channelRef: 'c',
        content: 'x',
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as TransientDeliveryFailure).retryAfterSeconds).toBe(7);
    }
  });

  it('treats a network error with no status as transient', async () => {
    const binding = createDiscordBinding({
      registry,
      fetchImpl: (async () => {
        throw new Error('ECONNRESET');
      }) as typeof fetch,
    });
    await expect(binding.send('app-1', { channelRef: 'c', content: 'x' })).rejects.toBeInstanceOf(
      TransientDeliveryFailure,
    );
  });

  it('succeeds quietly on 2xx', async () => {
    await expect(
      bindingReturning(204).send('app-1', { channelRef: 'c', content: 'x' }),
    ).resolves.toBeUndefined();
  });
});

describe('redaction', () => {
  it('censors secret-ish fields even when a caller passes one by mistake', () => {
    // pino writes to the file descriptor directly, so spying on process.stdout catches
    // nothing. Build a logger with the REAL redact paths and a capturing stream instead —
    // this asserts the shipped configuration, not a restatement of it.
    const written: string[] = [];
    const probe = pino({ redact: { paths: REDACT_PATHS, censor: '[redacted]' }, base: undefined }, {
      write: (chunk: string) => written.push(chunk),
    } as never);

    probe.info(
      {
        token: 'super-secret-bot-token',
        nested: { secret: 'inner-secret', password: 'hunter2' },
        harmless: 'visible',
      },
      'a log line',
    );

    const output = written.join('');
    // Relying on callers never to pass a credential is relying on perfect vigilance
    // forever. Redacting by key name means the mistake still does not reach the log.
    expect(output).not.toContain('super-secret-bot-token');
    expect(output).not.toContain('inner-secret');
    expect(output).not.toContain('hunter2');
    expect(output).toContain('[redacted]');
    expect(output, 'non-secret fields must survive').toContain('visible');
  });
});
