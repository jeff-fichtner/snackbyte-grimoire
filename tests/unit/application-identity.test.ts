// @vitest-environment node
/**
 * Identity is a lookup, never a constant.
 *
 * The failure this guards is not a crash — it is a `const rest = new REST(env.TOKEN)` at
 * module scope, which works perfectly until the day a second application exists and then
 * requires touching every call site. The predecessor priced exactly that refactor as the
 * most expensive item in its tenancy work.
 */
import { describe, expect, it } from 'vitest';
import {
  UnknownApplication,
  UnresolvableToken,
  createRegistry,
} from '../../src/bindings/registry.js';
import { FakeRepository } from '../../src/db/fake-repository.js';

const applications = [
  { id: 'app-platform', binding: 'discord', tenantId: null, tokenRef: 'DISCORD_BOT_TOKEN' },
  { id: 'app-tenant', binding: 'discord', tenantId: 'tenant-a', tokenRef: 'TENANT_TOKEN' },
];

const registry = createRegistry({
  repo: new FakeRepository({ applications }),
  resolvePlatformToken: (ref) =>
    ({ DISCORD_BOT_TOKEN: 'platform-token', TENANT_TOKEN: 'tenant-token' })[ref],
});

describe('getRest', () => {
  it('resolves a client for a given application id', async () => {
    const client = await registry.getRest('app-platform');
    expect(client.applicationId).toBe('app-platform');
    expect(client.token).toBe('platform-token');
  });

  it('resolves two ids independently — a second application is a row, not a rewrite', async () => {
    const platform = await registry.getRest('app-platform');
    const tenant = await registry.getRest('app-tenant');
    expect(platform.token).not.toBe(tenant.token);
    expect(platform.applicationId).not.toBe(tenant.applicationId);
  });

  it('has no exported surface that hands out a client without an id', async () => {
    // The registry's whole API is getRest(applicationId). Anything callable with no
    // argument would be the module-level client this design exists to prevent.
    const exported = Object.keys(registry);
    expect(exported).toEqual(['getRest']);
    expect(registry.getRest.length).toBe(1);
  });

  it('refuses an unknown application rather than falling back to a default', async () => {
    await expect(registry.getRest('nope')).rejects.toBeInstanceOf(UnknownApplication);
  });

  it('refuses when the token reference resolves to nothing', async () => {
    const empty = createRegistry({
      repo: new FakeRepository({ applications }),
      resolvePlatformToken: () => undefined,
    });
    await expect(empty.getRest('app-platform')).rejects.toBeInstanceOf(UnresolvableToken);
  });
});
