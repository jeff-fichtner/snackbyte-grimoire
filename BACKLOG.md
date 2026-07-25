# Grimoire — backlog

Known future work that is **not yet a spec**. Each item is a candidate for a `spec/NNN-*`
branch when it is picked up; nothing here is committed to, and living here is not a promise to
build. Keep entries short: what exists now, what is wanted, and what it touches.

## Tenant-supplied source-enrichment credentials

**Now.** ClickUp task-status relays are enriched with the task name through an optional
source-side `enrich()` hook (`src/sources/clickup/adapter.ts`), which reads a **per-tenant**
secret `clickup.api-token`. The mechanism is already tenant-scoped — but the token is currently
provisioned by an operator: one personal token (Jeff's) is written into every tenant's secret.
So in practice every tenant enriches **as Jeff**, using his ClickUp authority.

**Wanted.** Let each tenant supply and manage its **own** enrichment credential, so enrichment
runs under the tenant's own authority (their workspace, their token) rather than a shared
operator token. This is a **product-surface** gap, not an architecture one: the secret store
and the `enrich()` hook are already per-tenant. What's missing is the tenant-facing way to set
the credential — the composer, or an OAuth "connect ClickUp" flow — plus the same pattern
extended to other sources (a GitHub token to enrich PR/issue/commit detail, etc.).

**Touches.** `src/sources/types.ts` (`enrich`, `EnrichContext`), `src/sources/clickup/adapter.ts`,
the secret store, and whatever tenant-facing provisioning surface exists when this is picked up.
