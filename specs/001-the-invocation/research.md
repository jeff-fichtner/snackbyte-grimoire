# Research — 001 The Invocation

Phase 0. Every decision the spec deliberately left out, resolved with its rejected
alternatives. Nothing here is marked NEEDS CLARIFICATION.

---

## 1. Making a tenant reference unforgeable

**Decision.** A branded type whose brand is a module-private `unique symbol`, exported as a
type only. `TenantRef` has no public constructor; the sole minting functions live in
`core/law/` and require verified evidence as input. The repository accepts `TenantRef`, never
`string`.

```ts
declare const brand: unique symbol;
export type TenantRef = { readonly [brand]: 'tenant' } & { readonly id: string };
```

**Rationale.** FR-007 requires the reference to be *unconstructible from the request*, not
merely *not constructed from it*. A convention ("always pass the tenant") fails silently the
first time someone forgets; a type without a constructor fails at compile time. Because the
brand symbol is never exported, no cast short of `as unknown as TenantRef` can forge one — and
that phrase is greppable and lint-bannable, which a missing `WHERE` clause is not.

**Alternatives rejected.**

- _A plain `string` plus code review._ This is what the predecessor did.
  `getRoutes(session.tenantId)` and `getRoutes(req.body.tenantId)` have identical signatures
  and opposite security; the type system cannot tell them apart.
- _A runtime-validated class._ Catches forgery at runtime, but only on the path that happens to
  run. The failure we are guarding is a query issued somewhere nobody tested.
- _Row-level security in Postgres._ Genuinely strong, and worth revisiting later. Rejected for
  001 because it moves the guarantee into a place the test suite cannot easily exercise with a
  fake, and because it does not stop application code from *reading* the wrong tenant's rows
  into memory before the database refuses.

---

## 2. Verifying signatures over the exact bytes

**Decision.** Mount `express.raw({ type: '*/*' })` on the inbound route only, verify the HMAC
against that `Buffer` with `crypto.timingSafeEqual`, and parse JSON *after* verification
succeeds. The rest of the app keeps `express.json()`.

**Rationale.** Principle II requires verification on the exact received bytes before parsing.
`JSON.parse` followed by `JSON.stringify` does not round-trip byte-for-byte — key order,
whitespace, and unicode escapes all shift — so a signature computed over the original body
will not match a re-serialized one. This is the single most common way webhook verification is
silently broken.

**Alternatives rejected.**

- _`express.json({ verify })` capturing `req.rawBody`._ Works, but it parses first and verifies
  inside the parser's callback, which inverts the required order and leaves parsed output
  available on a path that has not yet been authenticated.
- _Re-serializing the parsed body._ Broken for the reasons above.

---

## 3. Making an unknown tenant and a forged signature indistinguishable

**Decision.** One code path for both. When the selector resolves to no source registration,
verify the presented signature against a **decoy secret** of the same length, discard the
result, and return the identical refusal. Both branches perform one lookup and one
`timingSafeEqual`.

**Rationale.** FR-004 requires the two to be indistinguishable in body, status, *and* timing.
An early `return 401` on unknown-selector is measurably faster than the HMAC path, and that
difference is a tenant-enumeration oracle: a prober learns which install identifiers exist.

**Alternatives rejected.**

- _Return the same body and status, but skip the HMAC when the tenant is unknown._ Identical
  responses, leaky timing. This is the trap worth naming, because it looks correct in review.
- _A fixed artificial delay._ Adds latency to every request, and jitter still leaks the
  underlying difference in aggregate.

**Testing note.** Timing equivalence is asserted statistically (compare median latencies across
many samples, assert the difference is within noise), not by a single measurement.

---

## 4. Idempotency that survives concurrency

**Decision.** A `UNIQUE` constraint on `(spell_id, dedupe_key)` in the records table, with the
row inserted **before** delivery is attempted. A duplicate insert raises a unique violation,
which is caught and reported as `deduped`. The database is the arbiter, not application code.

**Rationale.** FR-015 requires exactly-once behaviour including when the same event arrives
concurrently. A check-then-act in application code (`if (!alreadyDelivered) deliver()`) has a
race window between the check and the insert; two concurrent copies both see "not delivered"
and both deliver. A uniqueness constraint has no such window because the database serializes it.

**Alternatives rejected.**

- _Read-then-write in the application._ The predecessor's shape. Correct under sequential
  traffic and wrong under a provider's retry storm, which is exactly when it matters.
- _An in-process lock or mutex._ Does not survive more than one instance, and Cloud Run will
  eventually run more than one.

---

## 5. Recording an outcome without ever lying

**Decision.** Two writes per invocation: insert the record as `pending` before attempting
delivery, then update it to its terminal outcome. A record left `pending` by a crash is
truthful — it says "we started this and do not know how it ended," which is exactly the state.

**Rationale.** FR-017 forbids reporting as delivered anything that was not. A single write
after delivery cannot satisfy that: a crash between the successful send and the write leaves no
record of a message that really was sent, and a single write *before* delivery would claim
success that has not happened.

**Alternatives rejected.**

- _Write once, after delivery._ Loses the fact of an attempt on crash, and cannot support the
  pre-insert uniqueness constraint from §4.
- _A full transactional outbox with a drain worker._ The correct end state and the predecessor's
  planned 016, but it changes the acknowledgment contract and deserves its own spec. The
  `pending` state here is deliberately the seam that feature will grow from.

---

## 6. Fair share of one destination's capacity

**Decision.** A per-tenant concurrency cap inside the chokepoint — a small semaphore keyed by
tenant, so no single tenant can occupy every in-flight delivery slot. Global rate-limit
backoff remains shared and is honoured by all.

**Rationale.** FR-019 and Principle III require the chokepoint to arbitrate fairly. A
concurrency cap is the smallest mechanism that is *total* — it cannot starve anyone, needs no
tuning against traffic that does not exist yet, and has no queue to grow unboundedly.

**Alternatives rejected.**

- _A weighted queue or token bucket per tenant._ Better under real contention, but it needs real
  traffic to tune. The predecessor explicitly deferred the mechanism choice pending data; that
  reasoning still holds.
- _Nothing until it hurts._ Not available: Principle III states the obligation, and a chokepoint
  built without any notion of per-tenant limits is where the retrofit would be expensive.

---

## 7. Where tenant secrets live

**Decision.** A `secrets` table holding reference name → value, with values encrypted at rest
by the database, read through `resolveSecret(tenantRef, ref)`. Platform configuration
(`DATABASE_URL`, `PORT`, `LOG_LEVEL`) stays in environment variables.

The bot token is the one value that is platform configuration **and** must not be reached as a
constant. Its bytes live in the environment (`DISCORD_BOT_TOKEN`) — legitimate, since no second
tenant needs a different value — but nothing reads that variable directly. It is named by
`applications.token_ref` and reached only through `getRest(applicationId)`. The Technology
Constraint at issue is about the *seam*, not the storage: identity must be a lookup so that a
second application, or one connection of a sharded pool, is a row rather than a change to every
call site. Storage may move later without touching a caller; the lookup cannot be added later
without touching all of them.

**Rationale.** Principle VII requires tenant-scoped secrets to come from a store that is
writable at runtime, because a tenant adding an integration must not require a deploy — and on
Cloud Run a deploy restarts the service. The decisive test from the constitution applies
cleanly: a second tenant needs a different signing secret (data) but the same `DATABASE_URL`
(config).

**Alternatives rejected.**

- _Google Secret Manager per tenant._ Stronger isolation, but a per-tenant secret becomes an IAM
  object with its own lifecycle and quota, and the seam (`resolveSecret`) is identical either
  way. Deferred without cost.
- _Environment variables._ What the predecessor did, and the specific thing the pivot
  condemned: setting one restarts the service and drops every tenant.

**Non-negotiable either way:** values never enter a row that any surface renders, and the logger
redacts by key name at the serializer.

---

## 8. Reusing the predecessor's error classification

**Decision.** Lift the permanent-vs-transient rule verbatim: 401, 403, and 404 are permanent
and are not retried; 429 and 5xx are transient; a network error with no status is transient.
Backoff honours `Retry-After` when present, otherwise `2^attempt * 250ms`, bounded at 4
attempts.

**Rationale.** This is Tier 1 knowledge in `MIGRATION.md` — earned against the live API, and
the exact kind of thing that gets subtly wrong when retyped from memory. Retrying a 403 forever
is the classic version of that mistake.

**Alternatives rejected.** Re-deriving it. There is no upside.

---

## 9. HTTP framework

**Decision.** Express 5, matching the predecessor.

**Rationale.** Boring on purpose. It is already proven against this exact workload, its raw-body
handling is well understood (§2), and `supertest` integrates directly. Nothing in this feature
is framework-sensitive, and the routing surface is two endpoints plus health.

**Alternatives rejected.** Hono and Fastify are both faster and more modern; neither difference
is reachable at this scale, and swapping frameworks would spend novelty budget on the one layer
that carries no product risk.

---

## 10. Acknowledging the source in time

**Decision.** Acknowledge once the record is durably written as `pending` and the walk has been
handed to delivery — not after delivery completes.

**Rationale.** FR-001 requires answering before the source gives up and resends; GitHub's
budget is 10 seconds, and a slow or retrying Discord call can exceed it. Acknowledging after
durability is honest — the event is recorded and will be acted on — and it keeps a slow
destination from manufacturing duplicate inbound events.

**Consequence, accepted:** a crash between acknowledgment and delivery leaves a `pending`
record and an undelivered message. That is a known, recorded gap, and it is precisely what a
durable outbox closes later. It is visible rather than silent, which is the requirement.
