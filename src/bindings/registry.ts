/**
 * Identity is a lookup, never a constant.
 *
 * `getRest(applicationId)` loads the `applications` row and resolves its `token_ref`. No
 * exported function returns a client without an id, and no module holds one at load time.
 *
 * The seam matters more than today's storage. The token's bytes currently live in
 * `DISCORD_BOT_TOKEN` — legitimate platform config, since no second tenant needs a different
 * value — but nothing reads that variable directly; it is reached only by the resolver
 * behind `token_ref`. Storage can move later without touching a caller. The *lookup* cannot
 * be added later without touching every caller, which is precisely what the predecessor
 * discovered when it priced this refactor as the most expensive item in its tenancy work.
 *
 * `getRest(appId)` returning today's single row, versus returning one connection of a
 * sharded pool later, is the same signature.
 */
import type { Repository } from '../db/repository.js';

export interface RestClient {
  readonly applicationId: string;
  readonly token: string;
}

export class UnknownApplication extends Error {
  constructor(applicationId: string) {
    super(`no enabled application ${applicationId}`);
    this.name = 'UnknownApplication';
  }
}

export class UnresolvableToken extends Error {
  constructor(ref: string) {
    super(`token_ref "${ref}" resolved to nothing`);
    this.name = 'UnresolvableToken';
  }
}

/**
 * Resolves a reference name to its value.
 *
 * Platform-owned applications (tenant_id NULL) resolve through platform config; a
 * tenant-owned one would resolve through the tenant secret store. The call site is identical
 * either way, which is the entire point.
 */
export type TokenResolver = (ref: string) => string | undefined;

export interface RegistryDeps {
  repo: Repository;
  resolvePlatformToken: TokenResolver;
}

export function createRegistry({ repo, resolvePlatformToken }: RegistryDeps) {
  return {
    async getRest(applicationId: string): Promise<RestClient> {
      const application = await repo.getApplication(applicationId);
      if (!application) throw new UnknownApplication(applicationId);

      // A tenant-owned application would resolve through the tenant secret store here.
      // Same shape, same call site — only the resolver differs.
      const token = resolvePlatformToken(application.tokenRef);
      if (!token) throw new UnresolvableToken(application.tokenRef);

      return { applicationId: application.id, token };
    },
  };
}

export type Registry = ReturnType<typeof createRegistry>;
