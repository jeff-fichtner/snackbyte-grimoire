// @vitest-environment node
/**
 * ClickUp enrichment: the webhook sends only a task id, so the adapter asks the ClickUp API for
 * the task's name and where it lives (workspace › space › folder › list). The properties that
 * matter are all about NOT breaking delivery: enrichment only ever ADDS facts, and every failure
 * mode (no token, a bad id, an API error, a thrown fetch, a partial lookup) returns the event
 * with whatever was gathered so the relay still fires — a lost fact, never an invented one and
 * never a dropped event.
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

/** A fetch stub that routes by URL substring, so the task/space/team calls get distinct bodies. */
function routedFetch(routes: Array<[string, { status?: number; body: unknown }]>): {
  fn: typeof fetch;
  calls: Array<{ url: string; auth?: string }>;
} {
  const calls: Array<{ url: string; auth?: string }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, auth: (init.headers as Record<string, string>)?.Authorization });
    const hit = routes.find(([pattern]) => url.includes(pattern));
    const status = hit?.[1].status ?? (hit ? 200 : 404);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => hit?.[1].body ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const fullRoutes: Array<[string, { status?: number; body: unknown }]> = [
  [
    '/task/abc123',
    {
      body: {
        name: 'Fix the login bug',
        folder: { name: 'Web', hidden: false },
        list: { name: 'REEN' },
        space: { id: 's1' },
        team_id: 't1',
      },
    },
  ],
  ['/space/s1', { body: { name: 'MCDS' } }],
  ['/team', { body: { teams: [{ id: 't1', name: 'Forte' }] } }],
];

describe('clickup enrichment', () => {
  it('adds the task name and the full location breadcrumb', async () => {
    const { fn, calls } = routedFetch(fullRoutes);
    const out = await clickup.enrich!(event, ctx({ token: 'pk_tenant_token', fetch: fn }));
    expect(out.facts.task_name).toBe('Fix the login bug');
    expect(out.facts.workspace).toBe('Forte');
    expect(out.facts.space).toBe('MCDS');
    expect(out.facts.folder).toBe('Web');
    expect(out.facts.list).toBe('REEN');
    expect(out.facts.location).toBe('Forte › MCDS › Web › REEN');
    expect(calls[0]).toEqual({
      url: 'https://api.clickup.com/api/v2/task/abc123',
      auth: 'pk_tenant_token',
    });
    // original event is not mutated
    expect(event.facts.task_name).toBeUndefined();
  });

  it('omits a hidden (folderless) folder from the facts and the breadcrumb', async () => {
    const routes: Array<[string, { status?: number; body: unknown }]> = [
      [
        '/task/abc123',
        {
          body: {
            name: 'T',
            folder: { name: 'hidden', hidden: true },
            list: { name: 'Inbox' },
            space: { id: 's1' },
            team_id: 't1',
          },
        },
      ],
      ['/space/s1', { body: { name: 'MCDS' } }],
      ['/team', { body: { teams: [{ id: 't1', name: 'Forte' }] } }],
    ];
    const { fn } = routedFetch(routes);
    const out = await clickup.enrich!(event, ctx({ token: 'pk_hidden', fetch: fn }));
    expect(out.facts.folder).toBeUndefined();
    expect(out.facts.location).toBe('Forte › MCDS › Inbox');
  });

  it('keeps the levels that resolved when a lookup fails (breadcrumb has no gap)', async () => {
    const routes: Array<[string, { status?: number; body: unknown }]> = [
      [
        '/task/abc123',
        {
          body: {
            name: 'T',
            folder: { name: 'Web' },
            list: { name: 'REEN' },
            space: { id: 's1' },
            team_id: 't1',
          },
        },
      ],
      ['/space/s1', { status: 500, body: {} }], // space lookup fails
      ['/team', { body: { teams: [{ id: 't1', name: 'Forte' }] } }],
    ];
    const { fn } = routedFetch(routes);
    const out = await clickup.enrich!(event, ctx({ token: 'pk_partial', fetch: fn }));
    expect(out.facts.space).toBeUndefined();
    expect(out.facts.location).toBe('Forte › Web › REEN');
  });

  it('caches the slow /team lookup per token — the second event does not call it again', async () => {
    const { fn, calls } = routedFetch(fullRoutes);
    const token = 'pk_cache';
    const a = await clickup.enrich!(event, ctx({ token, fetch: fn }));
    const b = await clickup.enrich!(event, ctx({ token, fetch: fn }));
    expect(a.facts.workspace).toBe('Forte');
    expect(b.facts.workspace).toBe('Forte'); // still resolved, from cache
    expect(calls.filter((c) => c.url.endsWith('/team'))).toHaveLength(1);
    // task and space are NOT cached — fetched both times
    expect(calls.filter((c) => c.url.includes('/task/'))).toHaveLength(2);
  });

  it('passes through unchanged when the tenant has no token (never calls the API)', async () => {
    const { fn, calls } = routedFetch(fullRoutes);
    const out = await clickup.enrich!(event, ctx({ token: null, fetch: fn }));
    expect(out.facts.task_name).toBeUndefined();
    expect(out.facts.location).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('passes through when the API rejects the token (task 401)', async () => {
    const { fn } = routedFetch([['/task/abc123', { status: 401, body: {} }]]);
    const out = await clickup.enrich!(event, ctx({ token: 'bad', fetch: fn }));
    expect(out.facts.task_name).toBeUndefined();
    expect(out.facts.location).toBeUndefined();
  });

  it('passes through when the fetch throws (network/timeout)', async () => {
    const fn = vi.fn(async () => {
      throw new Error('aborted');
    }) as unknown as typeof fetch;
    const out = await clickup.enrich!(event, ctx({ token: 'pk', fetch: fn }));
    expect(out.facts.task_name).toBeUndefined();
  });

  it('does nothing when there is no task_id to look up', async () => {
    const { fn, calls } = routedFetch(fullRoutes);
    const noId: CanonicalEvent = { ...event, facts: { status: 'shipped' } };
    const out = await clickup.enrich!(noId, ctx({ token: 'pk', fetch: fn }));
    expect(out).toBe(noId);
    expect(calls).toHaveLength(0);
  });
});
