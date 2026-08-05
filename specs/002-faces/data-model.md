# Data Model — 002 Faces

Faces add one table and three in-code extensions. Every rule below restates a spec FR or a
constitution principle; nothing here is new policy.

## The ownership rule, unchanged

Every face belongs to exactly one tenant and is reached only through its tenant reference
(Constitution VIII). The webhook credential a face is delivered through is a secret, reached
only by reference (Constitution VII). Neither is ever queried unscoped or returned raw.

## New table: `faces`

A face is a noun — a community-owned persona bound to a channel.

```sql
CREATE TABLE faces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants (id),
  install_id  uuid NOT NULL REFERENCES installs (id),
  channel_ref text NOT NULL,
  name        text NOT NULL,              -- the per-message username override
  avatar_url  text,                       -- the per-message avatar override (nullable)
  secret_ref  text NOT NULL,              -- the CHANNEL's webhook credential in secrets(tenant_id, ref)
  origin      text NOT NULL,              -- 'minted' | 'adopted' — how the credential was obtained
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, install_id, channel_ref, name)
);

CREATE INDEX faces_by_channel ON faces (tenant_id, install_id, channel_ref);
```

- **`secret_ref`** points at the **per-channel** webhook credential in the existing `secrets`
  table — every face in the same `(tenant, channel)` carries the **same** `secret_ref`. The URL
  itself never lives here; only the reference name. (FR-013, Constitution VII.)
- **`UNIQUE (tenant_id, install_id, channel_ref, name)`** — a persona name is unique within a
  channel; two faces may share a channel (and its credential) but not a name.
- **`origin`** records the mint-vs-adopt fact so authorization provenance is auditable
  (Constitution VIII: "the platform minted this credential").
- The credential's lifetime is the union of its channel's faces (research §6): established when
  the first face in the channel is created, retired when the last is deleted.
- No `enabled` flag in v1 — a face is present or deleted; there is no third state to record.

## The webhook credential (reuses `secrets`)

No schema change. The per-channel webhook URL is stored as an ordinary secret:

- `ref` = a per-channel name, e.g. derived from `channel_ref`, so all of a channel's faces
  resolve the same credential.
- `value` = the webhook URL (a credential). Resolved at delivery via the existing
  `resolveSecret(tenant, ref)`; redacted in logs (Constitution VII).

## Extension: `spells.verb_config` (no schema change)

`verb_config` is `jsonb`; the `post_message` verb's config gains an optional `faceId`:

```jsonc
// speak as the application (001, unchanged):
{ "destinationId": "…", "transform": { "template": "…" } }

// speak through a face (002):
{ "faceId": "…", "transform": { "template": "…" } }
```

- Exactly one of `destinationId` (as the application) or `faceId` (through a face) is present.
- A `faceId` MUST resolve to a face owned by the spell's tenant (FR-008); the channel comes
  from the face row (no separate destination needed).
- Validation is total and typed, in the one rule language's `parseTransform` neighbourhood —
  an unknown shape is refused (Constitution IV).

## Extension: `OutboundMessage` (in code, `src/core/logistics/binding.ts`)

```ts
interface OutboundMessage {
  channelRef: string;
  content: string;
  face?: {                 // present ⇒ speak through a face
    credential: string;    // the resolved webhook URL — opaque to core, redacted in logs
    username: string;      // the face's name (per-message override)
    avatarUrl?: string;    // the face's avatar (per-message override)
  };
}
```

The `face.credential` is the resolved secret, placed on the message transiently by the
invocation just before the chokepoint. Core treats it as opaque; only the binding knows it is a
webhook URL. The logging boundary redacts it.

## Extension: `Binding` (in code, `src/core/logistics/binding.ts`)

Model-named face operations, implemented by each binding:

```ts
interface Binding {
  send(applicationId, message): Promise<void>;   // 001 — now branches on message.face

  // face lifecycle (used by the noun, not the walk) — only these three touch the platform:
  establishFace(applicationId, channelRef, name): Promise<{ credential: string }>;  // needs the management authority
  adoptFace(credential): Promise<void>;                   // accept a supplied credential (validate reachability)
  retireFace(credential): Promise<void>;                  // delete the channel's webhook — minted only
}
```

Listing and renaming are deliberately absent: faces are rows, so listing is a store read needing
no authority (FR-006), and the persona is applied per message, so a rename is a row update the
next message wears (FR-014) — neither has a live object to ask about or re-identify.

Names stay platform-neutral (`establish`/`adopt`/`retire`, "face", "credential"); the Discord
binding maps them to webhook create/get/delete and execute.

## Extension: `Repository` (tenant-scoped, `src/db/repository.ts`)

```ts
createFace(tenant, input): Promise<Face>;                 // insert row; input carries channel + name + avatar + secret_ref + origin
listFaces(tenant, channelRef?): Promise<Face[]>;          // FR-006 — tenant-scoped
getFace(tenant, faceId): Promise<Face | null>;            // FR-008 — resolve for a spell, tenant-scoped
renameFace(tenant, faceId, changes): Promise<boolean>;    // FR-014 — false when no row matched, so the noun can refuse
deleteFace(tenant, faceId): Promise<{ wasLastInChannel: boolean }>;  // FR-015 — signals credential retirement
countChannelFaces(tenant, installId, channelRef): Promise<number>;  // reference count for credential lifecycle
```

Every method takes the branded `TenantRef`; there is no unscoped face read or write.

## State & lifecycle

- **Create (mint)**: if the channel has no credential → `establishFace` → store URL as the
  channel secret under a fresh ref (`face-webhook.<install>.<channel>`) → `createFace` (origin
  `minted`). Else reuse the credential, taking its ref **from an existing face row** rather than
  re-deriving it → `createFace`.
- **Create (adopt)**: `adoptFace(supplied URL)` → store as the channel secret → `createFace`
  (origin `adopted`). Explicit, non-default, and only into a channel that has no credential yet —
  a channel already speaking through one **refuses** the adoption rather than dropping the
  supplied credential (which would leave a row whose `origin` lies about what is beneath it).
- **Speak**: spell names `faceId` → `getFace` (tenant-scoped) → `resolveSecret(channel ref)` →
  `OutboundMessage.face` → chokepoint → binding posts through the credential.
- **Rename/re-avatar**: `renameFace` updates the row, and that is the whole operation — the
  persona is applied per message, so the next message shows the change (FR-014).
- **Delete**: `deleteFace`; if `wasLastInChannel` → remove the channel secret, and `retireFace`
  **only when the credential was minted** — an adopted one is the community's own and outlives
  our use of it (FR-015). Prior messages untouched (FR-016).
