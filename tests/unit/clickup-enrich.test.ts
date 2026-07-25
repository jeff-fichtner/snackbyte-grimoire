// @vitest-environment node
/**
 * ClickUp enrichment: the webhook sends a task id but never the task's name, so the adapter
 * asks the ClickUp API for it with the tenant's token. The properties that matter are all about
 * NOT breaking delivery: enrichment only ever ADDS `task_name`, and every failure mode (no
 * token, a bad task id, an API error, a thrown fetch) returns the event untouched so the relay
 * still fires — a lost fact, never an invented one and never a dropped event.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CanonicalEvent } from '../../src/core/language/event.js';
import { clickup } from '../../src/sources/clickup/adapter.js';
import type { EnrichContext } from '../../src/sources/types.js';

const event: CanonicalEvent = {
  source: 'clickup',
  eventType: 'taskStatusUpdated',
  dedupeKey: 'history-1',
  facts: {
    task_id: 'abc123',
    status_before: 'backlogged',
    status: 'shipped',
    user: 'Jeff',
    url: 'https://app.clickup.com/t/abc123',
  },
};

function ctx(opts: { token: string | null; fetch: typeof fetch }): EnrichContext {
  return { resolveSecret: async () => opts.token, fetch: opts.fetch };
}

function fetchReturning(status: number, body: unknown): { fn: typeof fetch; calls: unknown[] } {
  const calls: unknown[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, auth: (init.headers as Record<string, string>)?.Authorization });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('clickup enrichment', () => {
  it('adds task_name from the API when a token is present', async () => {
    const { fn, calls } = fetchReturning(200, { name: 'Fix the login bug' });
    const out = await clickup.enrich!(event, ctx({ token: 'pk_tenant_token', fetch: fn }));
    expect(out.facts.task_name).toBe('Fix the login bug');
    expect(calls[0]).toEqual({
      url: 'https://api.clickup.com/api/v2/task/abc123',
      auth: 'pk_tenant_token',
    });
    // original event is not mutated
    expect(event.facts.task_name).toBeUndefined();
  });

  it('passes through unchanged when the tenant has no token (never calls the API)', async () => {
    const { fn, calls } = fetchReturning(200, { name: 'should not be fetched' });
    const out = await clickup.enrich!(event, ctx({ token: null, fetch: fn }));
    expect(out.facts.task_name).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('passes through when the API rejects the token (401)', async () => {
    const { fn } = fetchReturning(401, { err: 'Team not authorized' });
    const out = await clickup.enrich!(event, ctx({ token: 'bad', fetch: fn }));
    expect(out.facts.task_name).toBeUndefined();
  });

  it('passes through when the fetch throws (network/timeout)', async () => {
    const fn = vi.fn(async () => {
      throw new Error('aborted');
    }) as unknown as typeof fetch;
    const out = await clickup.enrich!(event, ctx({ token: 'pk', fetch: fn }));
    expect(out.facts.task_name).toBeUndefined();
  });

  it('does nothing when there is no task_id to look up', async () => {
    const { fn, calls } = fetchReturning(200, { name: 'x' });
    const noId: CanonicalEvent = { ...event, facts: { status: 'shipped' } };
    const out = await clickup.enrich!(noId, ctx({ token: 'pk', fetch: fn }));
    expect(out).toBe(noId);
    expect(calls).toHaveLength(0);
  });
});
