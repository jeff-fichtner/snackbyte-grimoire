# Research — 002 Faces

The spec has no NEEDS CLARIFICATION markers. These are the design decisions the plan commits
to, each grounded in the constitution, GRIMOIRE.md, and the 001 code faces extends.

## 1. A face is a persona; the webhook is a per-channel credential

**Decision**: A **face** is a community-owned persona — a name and an avatar — modelled as a
noun (a `faces` row). All of a channel's faces are delivered through **one per-channel
webhook**; that webhook's URL is the speaking **credential**, stored in `secrets` and reached
by reference. The credential is established when a channel's first face is created and retired
with its last.

**Rationale**: GRIMOIRE.md lists faces among the nouns ("owned things: resources — faces,
secrets-by-reference, targets"), so a face is a row, not inline config. The persona-vs-webhook
split is the predecessor's ARCHITECTURE §2.3 verbatim ("one webhook can wear unlimited faces
because `username`/`avatar_url` are per-message overrides; the hub needs roughly one webhook
per channel"). Making the face the persona (not the webhook) matches the user's own model —
"a GitHub face and a ClickUp face" are two faces sharing one channel's webhook.

**Alternatives considered**:
- *Face = webhook, 1:1*. Simpler (no shared-credential lifecycle) but caps a channel at 15
  personas and contradicts "one webhook wears many faces". Rejected — it re-introduces the
  scarcity the per-message override exists to remove.
- *Faces inline in `verb_config` (no table)*. Cannot satisfy list / rename / delete of a face
  as a first-class object (FR-006/014/015). Rejected — the spec needs faces to be nouns.

## 2. The webhook URL is a secret, never an address

**Decision**: The per-channel webhook URL is stored only in `secrets` (the existing
tenant-scoped store), referenced by the face row's `secret_ref`, resolved at delivery, and
redacted from logs. It is never returned by a list, never written to a spell row, never in a
message.

**Rationale**: Constitution VII names this exactly — "a capability URL (a webhook endpoint
that acts on possession) is a credential in the strongest sense and MUST be treated as a
secret, never an address." Possession is total control of the face, so it gets the same
handling as every other secret, reusing 001's `resolveSecret(tenant, ref)` seam unchanged.

**Alternatives considered**: a dedicated `webhook_url` column on `faces`. Rejected — that is a
browsable row holding a live credential, the precise thing VII forbids.

## 3. Face operations live on the core `Binding` interface, model-named

**Decision**: The core `Binding` interface gains face operations named in model terms —
*establish a channel's speaking credential*, *list a channel's faces*, *retire the credential*,
*re-identify (rename / re-avatar)*, and *post through a face*. The Discord binding implements
them via channel webhooks (`POST /channels/:id/webhooks`, `POST /webhooks/:id/:token`, …).

**Rationale**: Constitution I — "core code MUST NOT name a binding"; adding a capability must
be "one module + register it". Keeping the words at the model level (face, channel, persona)
means a second binding implements the same interface, and no `webhook` token leaks into core.
This mirrors how 001 kept signature schemes inside `sources/*` and delivery inside the binding.

**Alternatives considered**: a free-standing "webhook service" in core. Rejected — it would
name a platform mechanism in core and split delivery from the binding that owns the SDK.

## 4. A face message uses the one delivery chokepoint, branching only at the outbound call

**Decision**: `OutboundMessage` gains an optional `face` (the resolved credential + the
per-message name/avatar). The invocation resolves the face and its credential *before* the
chokepoint; `deliver` carries it through unchanged (idempotency, retry/backoff, recording all
apply identically); the binding's `send` branches at the last step — a `face` present posts
through the credential with the persona override, else it posts as the application.

**Rationale**: Constitution III — "all performance of verbs MUST flow through one logistics
chokepoint … no path may bypass it" (FR-011). A face changes *who speaks*, not *how delivery
is guaranteed*, so the branch belongs at the single outbound edge, not as a parallel path. The
resolved credential lives transiently on the message and is redacted at the logging boundary.

**Alternatives considered**: a separate `deliverThroughFace` path. Rejected — two delivery
paths means two places to get idempotency, backoff, and recording right, which is the bug 001
spent its chokepoint to avoid.

## 5. Minting is the default; adopting is gated and non-default

**Decision**: *Mint* (the platform establishes the channel's webhook) is the default path and
requires the binding to hold the management authority in that community. *Adopt* (accept a
supplied webhook URL) is a distinct, explicitly-flagged operation — never reachable by default
— that stores the supplied URL as the channel's credential.

**Rationale**: Constitution VIII — authorization is "verifiable, never claimed", and its worked
example is "the platform minted this credential". Minting proves someone with the platform's
management authority put the bot there; a pasted URL proves nothing and, in a multi-tenant
product, is a spam relay under the platform's name. So adopt is supported (it is how an
existing "miss honey" comes home) but carries its own justification and is never the default.

**Alternatives considered**: treat a pasted URL like any route target (the predecessor's old
default). Rejected — VIII and the spec both require minting to be primary.

## 6. Establishing and retiring the channel credential is reference-counted by faces

**Decision**: Creating a face in a channel with no existing credential establishes one (mint or
adopt) and stores it under a per-channel `secret_ref`. Creating further faces in that channel
reuses it. Deleting a face that is the channel's last retires the credential (the binding
deletes the webhook; the secret is removed). A deleted face's already-sent messages are
untouched.

**Rationale**: FR-010 (many faces share one credential) and FR-016 (deletion revokes future
use only) together imply the credential's lifetime is the union of its faces'. Reference-
counting by the `faces` rows keeps "one webhook per channel" true without a second table.

**Alternatives considered**: never retire the webhook. Rejected — a live credential with no
face is an un-revocable capability, the leak FR-014/015 exist to close.

## 7. Faces are provisioned by a script, not a UI or an endpoint

**Decision**: mint / adopt / list / rename / delete are exposed as the tenant-scoped noun
operations (`src/core/nouns/faces.ts`) and driven by a provisioning script
(`scripts/provision-face.mjs`), exactly as tenants and destinations are seeded today. No HTTP
route and no interface are added.

**Rationale**: The spec's Out of Scope puts the composer UI (and any management interface) in a
later spec, and 001 established that operational provisioning runs by script. Adding an endpoint
now would build surface this spec explicitly excludes.

**Alternatives considered**: a management HTTP API. Rejected — out of scope; it is the
composer's job.

## 8. A deleted-or-broken face fails closed and is recorded as failed

**Decision**: When an invocation names a face whose credential no longer resolves, or the
binding's post through it is refused, the outcome is recorded as **failed** (never delivered),
using 001's permanent-vs-transient classification (a deleted webhook → 404 → permanent).

**Rationale**: Constitution III / spec FR-015: the record never lies. A face is just another
way for delivery to fail, so it reuses the exact classification and recording 001 built —
nothing new is invented for the honest-record promise.
