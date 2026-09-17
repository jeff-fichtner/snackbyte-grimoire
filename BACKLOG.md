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

## Move the database off Supabase

**Now.** Both tiers are Supabase Postgres on the free plan, in one org: `grimoire-staging` and
`grimoire-prod`, reached through the Supavisor pooler (`aws-0-us-east-1.pooler.supabase.com`).
The app uses none of Supabase's platform — no PostgREST, Auth, Storage, or Realtime — only the
Postgres underneath, via `pg` and the migrations in `migrations/`.

**Why leave.** Free-plan projects auto-pause after 7 days without database activity. Staging
paused in early August 2026 and every deploy failed at container start until 2026-09-17, with
the running revision up-but-dead the whole time; prod is on the same rule and is kept alive
only by its own traffic. The stopgap is a Cloud Scheduler job (`grimoire-staging-db-keepalive` and `grimoire-db-keepalive`, in
`snackbyte-apps`, every 6h) hitting each tier's `/health/ready`, which runs `SELECT 1` through
the app's pool. The real fix Supabase offers is Pro (~$25/mo, no pausing) — and paying for a
platform whose only used part is plain Postgres is not where the money should go. The data
storage direction (decided in conversation, 2026-09-17) is that Supabase is not the
destination, so a Pro upgrade would be paying for a tier we'd migrate off anyway.

**Wanted.** A Postgres the app owns outright, with no idle-pause and no platform bundle —
Cloud SQL beside the Cloud Run services is the obvious candidate, given everything else
already lives in `snackbyte-apps`. Both tiers move; staging first, as the rehearsal.

**Touches.** The two `grimoire-<env>-database-url` secrets (the app reads only `DATABASE_URL`,
so the code path does not change), `scripts/migrate.mjs` against the new host, the data
itself (a `pg_dump`/restore per tier), the keepalive job (delete it once staging has moved),
and the Supabase projects (pause or delete after cutover).
