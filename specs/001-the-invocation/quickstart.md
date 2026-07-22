# Quickstart — 001 The Invocation

How to run this feature and prove it works. Every scenario below maps to a success criterion
in [spec.md](./spec.md); if they all pass, the feature is done.

## Prerequisites

- Node 24 (`nvm use` reads `.nvmrc`)
- A Postgres-compatible database (Supabase project), reachable via `DATABASE_URL`
- A Discord application with a bot token, and the bot present in a test community
- `.env` populated from `.env.example` — platform config only, never tenant data

## Setup

```sh
npm ci
npm run migrate          # applies migrations/ forward-only
npm run seed:dev         # two tenants, each with a registration, spell, and destination
npm run dev              # service on :8080, web surface on :5173
```

The seed deliberately creates **two** tenants. Isolation is the feature's second P1 story, so
a one-tenant fixture cannot demonstrate the thing most likely to be wrong.

## Verifying the walk

### 1. A spell speaks (SC-001)

Send a signed event to the first tenant's registration and watch it arrive.

```sh
npm run dev:send -- --tenant alpha --event release --tag v1.2.0
```

**Expect**: one message in alpha's destination channel, worded by the spell; the record shows
`delivered`; the response was `202` and arrived well inside a second.

### 2. An edit takes effect immediately (SC-002)

Change the spell's wording directly in the database, then resend with a new tag.

**Expect**: the new wording, with no restart and no deploy. If a restart is needed, spells are
being read at boot instead of per invocation (FR-011).

### 3. A condition declines (FR-012)

Send an event whose tag does not match the spell's predicate.

**Expect**: no message; the record shows `declined`, not `failed`. The distinction matters —
a declined event is the system working.

### 4. Isolation holds (SC-003) — the important one

Run every crossing:

```sh
npm run dev:cross          # sends alpha's event signed with beta's secret,
                           # alpha's event to beta's registration id,
                           # and a body claiming a tenant_id it does not own
```

**Expect**: every attempt refused; nothing delivered to either community; no response differing
by whether the registration exists. Then confirm nothing in beta's record table mentions
alpha's event.

### 5. Unknown and forged are indistinguishable (FR-004)

```sh
npm run dev:probe          # 200 requests: half unknown registration, half bad signature
```

**Expect**: identical status and body across all 400. The script reports median latency for
each group — the difference must sit inside the noise band it prints. A consistent gap means
an early return is leaking tenant existence (`research.md` §3).

### 6. Duplicates act once (SC-004)

Send the identical event five times, including two concurrently.

**Expect**: exactly one message. Four records show `deduped`. The concurrent pair must not both
deliver — if they do, the uniqueness constraint is missing or the claim happens after delivery
instead of before.

### 7. Failure is recorded as failure (SC-005)

Point a destination at a channel the bot cannot post to, then send an event.

**Expect**: retries with growing delays; a final record of `failed`; **no** record of
`delivered`. Then point it at a deleted channel: that is permanent, so expect **no** retries
at all before `failed`.

### 8. Recovery without intervention (SC-006)

Restore the destination's permission and send a fresh event.

**Expect**: delivery succeeds with no restart.

### 9. Liveness survives a dead store (FR-020)

Stop the database, then:

```sh
curl -s localhost:8080/health/live   # 200 {"live":true}
curl -s localhost:8080/health/ready  # 503 {"ready":false,...}
```

**Expect**: live stays 200. If it fails, the liveness probe is consulting a downstream
dependency and Cloud Run will kill the container during someone else's outage.

### 10. A second tenant is data only (SC-008)

Add a third tenant with the seed script.

**Expect**: it works with no code change and no deploy.

## Deployment check (SC-010)

```sh
npm run check:all        # must be green before anything ships
git push                 # release Action tags; deploy job runs on the tag
```

**Expect**: a running Cloud Run service — a **new** service, never the predecessor's — reachable
at its URL, `/health/ready` returning `ready: true`, with no manual step beyond supplying
secrets.

## What "done" means

All ten scenarios pass, `check:all` is green, and the service is serving. Scenarios 4, 5, 6, and
7 are the ones worth re-running after any refactor: they cover isolation, tenant enumeration,
exactly-once, and honest recording — the four properties this feature exists to establish and
the four that are expensive to notice later.
