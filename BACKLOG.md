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

## Extract a branding module (decouple the name from the code)

**Now.** The product name is an identifier throughout this repo, not just a surface.
User-facing occurrences (`index.html` `<title>`, the `Shell.tsx` wordmark, the
`Home.tsx` heading) are hardcoded literals rather than rendered from config. Beyond
those, the name is baked into `package.json` (name, description, test database),
a startup log string in `src/main.ts`, and — most expensively — `cloudbuild.yaml`:
the Artifact Registry repository path, the `_SERVICE` default, and the
`grimoire-<env>-` secret prefix that CI's isolation check conditions on.

**Wanted.** One branding module holding display name, wordmark, and name-bearing
copy, with every user-facing surface rendering from it — so a rebrand is a config
edit plus a DNS record. The convention is `snackbyte-base/NAMING.md`; this repo is
what motivated it.

**Touches.** `src/web/` (three surfaces), `package.json`, `src/main.ts`,
`cloudbuild.yaml`, and — if the identifiers are chased all the way down — Artifact
Registry, the Cloud Run service name, Secret Manager entries, and CI authorization.
Staged: brand slot first, identifiers second, infrastructure last. The infrastructure
half is a migration and should not be started casually.
