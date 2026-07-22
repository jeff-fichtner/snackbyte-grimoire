# Contract — inbound HTTP

The service's entire external surface for this feature. Three routes.

## `POST /invoke/:registrationId`

The one door an external source knocks on.

**`:registrationId`** is a `source_registrations.id` (uuid v4). It is **untrusted**: it selects
which secret to verify against and grants nothing on its own (FR-003).

**Request**: the source's own body, verbatim, with the source's own signature header. The body
is read as raw bytes and is not parsed until verification succeeds.

### Responses

| Status                      | When                                                            | Body                        |
| --------------------------- | --------------------------------------------------------------- | --------------------------- |
| `202 Accepted`              | Verified, recorded as `pending`, handed to delivery              | `{"accepted": true}`        |
| `401 Unauthorized`          | Unknown registration **or** bad signature — indistinguishable    | `{"error": "unauthorized"}` |
| `503 Service Unavailable`   | Ownership could not be established (store unreachable)           | `{"error": "unavailable"}`  |
| `413 Payload Too Large`     | Body exceeds the cap, refused before parsing                     | `{"error": "too_large"}`    |

**The 401 is a single behaviour, not two.** Same status, same body, same work: both branches
perform one lookup and one `timingSafeEqual`, the unknown-registration branch against a decoy
secret whose result is discarded. Any change that lets a caller distinguish them — including a
faster path — is a defect, not an optimization. See `research.md` §3.

**Why 503 and not 500** on an unreachable store: it invites the source to resend. A 500 tells
some providers the event was received and malformed, and they stop. FR-005 requires the event
to survive our outage, and the only mechanism available is the source's own retry.

**Acknowledgment is not delivery.** `202` means the event is durably recorded and will be
acted on — not that a message appeared. Waiting for delivery would exceed GitHub's 10-second
budget whenever the destination is slow, manufacturing duplicate inbound events. See
`research.md` §10.

**Never in any response**: whether a registration exists, which tenant owns it, whether a spell
matched, or anything derived from a secret.

## `GET /health/live`

Is the process running? Answers `200 {"live": true}` whenever the event loop is turning,
**independent of the database and of Discord** (FR-020, Principle VI). It must never consult a
downstream dependency — a liveness probe that fails when Postgres blips gets the container
killed during someone else's outage.

## `GET /health/ready`

Should this instance receive traffic? `200 {"ready": true}` when the store is reachable;
`503 {"ready": false, "reason": "..."}` when it is not. Readiness may reflect downstream state;
liveness may not. The reason string names the subsystem, never a credential or a tenant.

---

# Contract — module seams

The internal boundaries this feature establishes. These are the interfaces later specs extend,
so their shapes matter more than their current implementations.

## The dependency rule

```text
bindings/discord  ──▶  core        (allowed)
core              ──▶  bindings/*  (FORBIDDEN — enforced by lint)
```

Core defines the interfaces; the binding implements them and is injected at the composition
root. The predecessor inverted this (`core/routing/engine.ts` imported `core/discord/`), which
is why a second platform would have been a rewrite there. A lint rule makes the regression
loud instead of gradual.

## `TenantRef` — the law's only export that matters

```ts
declare const brand: unique symbol;
export type TenantRef = { readonly [brand]: 'tenant'; readonly id: string };

// The ONLY functions that mint one. Both take verified evidence.
export function tenantFromVerifiedCall(reg: VerifiedRegistration): TenantRef;
export function tenantFromVerifiedSession(session: VerifiedSession): TenantRef; // later specs
```

The brand symbol is never exported, so no caller outside `core/law/` can construct the type.
`as unknown as TenantRef` remains technically possible and is banned by lint — the point is
that forging one requires a greppable, reviewable phrase, whereas a forgotten `WHERE` clause
leaves no trace at all.

## `Repository` — every method takes the reference

```ts
interface Repository {
  findSpells(t: TenantRef, source: string, eventType: string): Promise<Spell[]>;
  getDestination(t: TenantRef, id: string): Promise<Destination | null>;
  resolveSecret(t: TenantRef, ref: string): Promise<string | null>;
  beginRecord(t: TenantRef, input: RecordInput): Promise<RecordHandle | 'duplicate'>;
  settleRecord(t: TenantRef, handle: RecordHandle, outcome: Outcome, detail?: string): Promise<void>;
  ping(): Promise<boolean>;   // the only unscoped method — it reads nothing
}
```

`beginRecord` returning `'duplicate'` is how the uniqueness constraint surfaces: the caller
never asks "was this delivered?", it simply tries to claim the event and is told if someone
already has. That removes the check-then-act race by construction (`research.md` §4).

## `TriggerSpecies` — the registry, not a switch

```ts
interface TriggerSpecies {
  readonly key: string;              // 'external_call'
  readonly opensReturnChannel: boolean;  // false here — nobody is waiting for a reply
}
```

`opensReturnChannel` is the two-way asymmetry made machine-readable. No verb that replies may
be used by a spell whose species does not open a channel — the agreement rule the composer
enforces at authoring time, and the reason the flag exists before there is a composer.

## `Verb` — a typed effect, classed

```ts
interface Verb<Config> {
  readonly key: string;                 // 'post_message'
  readonly verbClass: 'charm' | 'hex';  // only charms are composable
  readonly needsReturnChannel: boolean;
  perform(ctx: VerbContext, config: Config): Promise<void>;
}
```

`verbClass` exists from the first verb even though 001 ships only a charm, because retrofitting
a safety classification onto an unclassed vocabulary means auditing every verb later.

## `deliver` — the chokepoint

```ts
function deliver(t: TenantRef, target: Destination, message: Message): Promise<void>;
```

Everything outbound goes through it: dedupe already claimed upstream, per-tenant concurrency
cap, retry with backoff honouring `Retry-After`, permanent-vs-transient classification, and
outcome recording. There is no second path, and a verb never sees a status code — that
knowledge lives here and nowhere else.
