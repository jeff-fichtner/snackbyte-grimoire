# Contracts — 002 Faces

Faces expose no HTTP surface (the composer is a later spec). The contracts are the **internal
interfaces** the feature adds or extends, and the **provisioning-script** surface an operator
uses. Each contract names the FRs it satisfies and the refusals it must make.

## 1. The face noun — tenant-scoped operations (`src/core/nouns/faces.ts`)

Every operation takes the branded `TenantRef` (never a bare id) and is confined to that
tenant's faces (FR-005/007/008).

### `mintFace(tenant, { channelRef, name, avatarUrl? }) → Face`

- If the channel has no credential, establish one via `binding.establishFace` (requires the
  management authority — FR-002) and store its URL as the channel secret; else reuse it. "Else
  reuse it" means the ref is **read off an existing face row**, never re-derived — a ref is
  invented once (a channel's first face) and recalled thereafter, so a row and its channel can
  never disagree about where the credential lives. A new channel's ref carries the install, since
  one tenant may hold several installs that could name the same channel.
- Insert the face row with `origin: 'minted'`.
- **Refuses**: missing management authority → clear failure, no row written (FR-002); channel
  webhook cap reached → clear failure (edge case); a name already used in the channel → refused.

### `adoptFace(tenant, { channelRef, name, avatarUrl?, suppliedCredential }) → Face`

- The **non-default, more-privileged** path (FR-004). Validate the supplied credential via
  `binding.adoptFace`, store it as the channel secret, insert the row with `origin: 'adopted'`.
- **Refuses**: called as if it were the default (the caller must opt in explicitly); an
  unreachable/invalid supplied credential; a channel that already speaks through an established
  credential — `FaceConflict`, naming the conflict and pointing at `mint` instead. Adoption is a
  channel's first act or none at all, so "one channel, one credential, one origin" holds.

### `listFaces(tenant, channelRef?) → Face[]`

- Returns the tenant's faces (optionally one channel). **Never** includes the credential
  (FR-013). Reveals nothing of any other tenant's faces (FR-006/007).
- A **store read** — faces are rows, so no management authority is required and no binding op is
  involved (FR-006). The rows are present whatever authority the platform holds in the channel,
  which is why an empty result always means "no faces" and never "cannot see".

### `renameFace(tenant, faceId, { name?, avatarUrl? })`

- Updates the row — and nothing else. The persona is applied per message, so the next message
  wears the change with no platform call (FR-014). Tenant-scoped.
- **Refuses**: a face id that matches no row of this tenant → `NoSuchFace`. The face is unchanged
  either way (FR-007); the refusal is so the caller is never told it renamed something it didn't.

### `deleteFace(tenant, faceId)`

- Deletes the row; if it was the channel's last face, remove the channel secret (FR-015) — and
  call `binding.retireFace` **only when the credential was minted**. An adopted credential is the
  community's own: revoking our use of it must not destroy an identity we did not establish.
  Already-sent messages untouched (FR-016).
- **Refuses**: a face id that matches no row of this tenant — another tenant's, or one already
  deleted → `NoSuchFace` (FR-007). Delete is therefore not idempotent by design: a second delete
  is a caller believing something happened, and it is told otherwise.

## 2. The `Binding` face operations (`src/core/logistics/binding.ts`)

Model-named; the Discord binding maps them to webhooks. All are platform-neutral in core.

| Operation         | Input                                       | Output                 | Discord realisation                                                                   |
| ----------------- | ------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `establishFace`   | applicationId, channelRef, name             | `{ credential }`       | `POST /channels/:id/webhooks`                                                         |
| `adoptFace`       | credential                                  | void                   | validate via `GET` on the webhook URL                                                 |
| `retireFace`      | credential                                  | void                   | `DELETE /webhooks/:id/:token`                                                         |
| `send` (extended) | applicationId, OutboundMessage              | void                   | `POST /webhooks/:id/:token` (face) **or** `POST /channels/:id/messages` (application) |

Only three operations touch the platform. **Listing** is absent because faces are rows — a store
read, no authority, no binding op (FR-006). **Renaming** is absent because the name and avatar are
applied per message in `send`, so a rename is a pure row update that the next message wears
(FR-014) — there is no live object to re-identify.

- `establishFace` needs the management authority (least privilege, Constitution II); the others
  act on credential possession alone.
- Failure classification on `send` through a face is **unchanged** from 001: 401/403/404
  permanent (a retired webhook → 404), 429/5xx transient with `Retry-After` (FR-018).

## 3. The verb contract (`post_message`, `verb_config`)

```jsonc
{ "faceId": "<uuid>", "transform": { "template": "<string ≤ 4000>" } }
```

- `faceId` XOR `destinationId` — exactly one. `faceId` MUST resolve to a tenant-owned face
  (FR-008), else the invocation is recorded **failed** (FR-015), never delivered.
- Parsing is total and typed; an unknown config shape is refused (Constitution IV).

## 4. The provisioning-script surface (`scripts/provision-face.mjs`)

The operator path, mirroring `seed-prod.mjs`. Every required value comes from the environment
with **no fallback** (fail loud):

```
DATABASE_URL=… TENANT_NAME=… DISCORD_CHANNEL_ID=… FACE_NAME=… [FACE_AVATAR_URL=…] \
  node scripts/provision-face.mjs mint          # default, safe
  … ADOPT_WEBHOOK_URL=…  node scripts/provision-face.mjs adopt   # explicit, non-default
  node scripts/provision-face.mjs list
  … FACE_ID=…            node scripts/provision-face.mjs rename   # FACE_NAME / FACE_AVATAR_URL
  … FACE_ID=…            node scripts/provision-face.mjs delete
```

- `adopt` requires `ADOPT_WEBHOOK_URL` to be set explicitly — it cannot be the accidental
  default (FR-004).
- The script never prints the webhook URL (Constitution VII).

## Contract tests (what `/speckit-tasks` will turn into cases)

- Mint a face, point a spell at it, invoke → message under the face's name/avatar (FR-001/009).
- Two faces in one channel → both delivered, one webhook established (FR-010).
- Cross-tenant: name B's face from A's spell / list as the wrong tenant / delete another's →
  all refused (FR-007/008).
- Delete a face a spell uses → next invocation recorded **failed**, not delivered (FR-015).
- The credential appears in no list output and no log line (FR-013, Constitution VII).
- A face message and an application message take the same chokepoint and record identically
  (FR-011/012).
