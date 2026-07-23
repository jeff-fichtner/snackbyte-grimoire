# Feature Specification: Faces

**Feature Branch**: `spec/002-faces`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "002 — Faces: the persona engine. A face is a tenant-owned custom speaking identity — created by the platform or adopted from an existing one — that a spell speaks through with a chosen name and avatar, so a source (GitHub, ClickUp) or a persona ('miss honey') speaks as itself rather than as the platform's own identity. Discharges the predecessor's planned 010-faces; its prerequisites (a secret store, tenant identity) are already met by spec 001."

---

## Why this feature exists

Today every spell speaks as the platform's own identity. A community's GitHub relays, its
ClickUp relays, and its announcements all arrive from one indistinguishable voice. The
product's promise is that a community's book is _its own_ — so its messages should be able to
wear _its own_ faces: a "GitHub" identity for code events, a "ClickUp" identity for tasks, a
"miss honey" persona that its members already recognise.

A **face** is a custom speaking identity — a name and an avatar — that a community owns and a
spell speaks _through_ instead of speaking as the platform. This is the only way to give a
message a name and picture other than the platform's own, and it is the first expansion of
what a spell can do beyond the walking skeleton: the same invocation, the same single
delivery point, the same honest record — but the community chooses the voice.

This feature is the direct successor to a station the predecessor system planned and never
built (its "010 — faces"). That plan was blocked behind a secret store and a tenant-identity
model it did not yet have; Grimoire built both in spec 001, so faces is unblocked with no
prerequisite work — only the capability itself remains.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A spell speaks with a face the community chose (Priority: P1)

A community owner creates a face — a name and an avatar, "GitHub" — in one of its channels.
They point a spell at that face. When the spell next speaks, the message appears in the
channel under that name and avatar, not the platform's. One face can carry many personas: the
same face can speak once as "GitHub" and once as "ClickUp", because the name and picture are
chosen per message.

**Why this priority**: This is the feature's minimum viable sentence — a community giving its
own voice to a message. Everything else (isolation, revocation, adoption) protects or extends
this; without it there is nothing to protect.

**Independent Test**: Create a face for one community, point a spell at it, drive a real event
the spell answers, and observe the message arrive under the chosen name and avatar rather than
the platform's. Fully testable without any other user story.

**Acceptance Scenarios**:

1. **Given** a community has created a face with a chosen name and avatar and a spell that
   speaks through it, **When** the spell is invoked, **Then** the message appears under that
   name and avatar, not the platform's identity.
2. **Given** two spells that speak through the same face with different chosen names, **When**
   each is invoked, **Then** each message appears under its own name — one face wears both.
3. **Given** a spell that speaks through a face, **When** it is invoked, **Then** the message
   passes through the same single delivery point and is recorded identically to a message the
   platform sends as itself — same guarantees, same record.
4. **Given** a face a spell speaks through, **When** the community renames the face or changes
   its avatar, **Then** the spell's next message appears under the new name or avatar, with no
   restart or redeployment.

---

### User Story 2 - A face belongs to one community and no other can reach it (Priority: P1)

Each community's faces are its own. No community can create, list, rename, delete, or speak
through another community's face, and none can learn another's faces exist.

**Why this priority**: Equal to Story 1 and inseparable from it. A face is a live, powerful
resource — whoever can speak through it can post anything under that identity. If one
community could reach another's face, the platform would be a spam relay wearing a stranger's
name. Isolation is not a later hardening; it is what makes faces shippable at all.

**Independent Test**: Give two communities their own faces, then attempt every crossing:
address one community's face by the other's identity, list one community's faces while acting
as the other, and make a spell of one community speak through a face of the other.

**Acceptance Scenarios**:

1. **Given** two communities each with a face, **When** one community lists its faces, **Then**
   it sees only its own, and nothing reveals that the other's exist.
2. **Given** a face owned by community A, **When** anything acting for community B attempts to
   speak through, rename, or delete it, **Then** the attempt is refused and the face is
   unchanged.
3. **Given** a spell owned by community A, **When** it is configured to speak through a face,
   **Then** it can only be pointed at community A's own faces — a face belonging to B cannot be
   named.

---

### User Story 3 - A face can be revoked, and revocation never lies (Priority: P2)

A community can delete a face to revoke it. After deletion, any spell that still points at it
fails to speak cleanly — the failure is recorded as a failure, and nothing is ever recorded as
delivered that did not appear.

**Why this priority**: A face that cannot be revoked is a credential that cannot be closed —
possession of it is total, forever. Revocation is the safety valve. It is P2 only because a
face must be creatable and speakable before it is worth revoking, and the honest-record
promise it depends on already exists from spec 001.

**Independent Test**: Create a face, speak through it once (delivered), delete it, then drive
the same spell again and confirm the second attempt is recorded as failed — never as
delivered — with no message appearing.

**Acceptance Scenarios**:

1. **Given** a face a spell speaks through, **When** the community deletes the face and the
   spell is next invoked, **Then** no message appears and the outcome is recorded as failed.
2. **Given** a deleted face, **When** the community lists its faces, **Then** the deleted face
   is absent.
3. **Given** a face that has already delivered messages, **When** it is deleted, **Then** the
   messages it already sent remain unchanged — deletion revokes future use, not past speech.

---

### User Story 4 - An existing persona comes home (Priority: P3)

A community already has a custom identity in a channel — a persona its members know. Rather
than create a new one, it adopts the existing identity so its spells can speak through it.
Adoption is a deliberate, more-guarded act than creation, because it accepts an identity the
platform did not itself establish.

**Why this priority**: Creation covers the common case; adoption covers the migration case —
bringing an already-loved persona under the community's book without members noticing a
change. It is P3 because it is an alternative entry to the same capability Story 1 delivers,
valuable but not the first thing to prove.

**Independent Test**: Supply an existing custom identity to a community, adopt it, point a
spell at it, and confirm messages arrive under the pre-existing name and avatar.

**Acceptance Scenarios**:

1. **Given** an existing custom identity supplied to a community, **When** the community adopts
   it, **Then** a spell can speak through it and messages appear under the pre-existing name
   and avatar.
2. **Given** adoption of a supplied identity, **When** it is offered, **Then** the platform
   treats it as a distinct, more-privileged act than creation — never the default path — and
   an adopted identity is owned by exactly the community that adopted it.

---

### Edge Cases

- **A face's secret is a credential, never an address.** The value that lets the platform
  speak through a face grants total control of that face to anyone who holds it. It is stored
  the way every other credential is — resolved by reference, never rendered into a message,
  never returned in a listing, never shown in a browsable form.
- **The platform lacks permission to create a face.** Creating and listing faces require an
  authority the platform may not have been granted in a given community. When it is absent,
  creation and listing fail clearly, and the community is told what is missing — the platform
  does not pretend a face was created.
- **A channel reaches its limit on delivery webhooks.** A channel has a hard cap on how many
  webhooks can exist in it. Because all of a channel's faces share one webhook, this binds only
  in the extreme; when it does, establishing the channel's webhook fails clearly rather than
  silently displacing an existing one.
- **A face is deleted between an event arriving and its delivery.** The invocation fails
  cleanly and is recorded as failed; nothing is reported delivered.
- **The platform's identity behind a face is itself removed or forbidden.** Speaking through
  the face fails, and the failure is classified the same way any delivery failure is —
  permanent refusals are not retried, temporary ones are retried within bounds.
- **Two spells speak through the same face at once.** Each message appears under its own chosen
  name and avatar; the shared face is not a point of interference.

## Requirements _(mandatory)_

### Functional Requirements

**Creating and adopting a face**

- **FR-001**: A community MUST be able to create a face in one of its channels, giving it a
  chosen name and avatar, such that the face becomes available for its spells to speak through.
- **FR-002**: Creating a face MUST be the default, safe way to obtain one, and MUST require the
  platform to hold, in that community, the authority to create it — creation that the platform
  is not permitted to perform MUST fail clearly rather than appear to succeed.
- **FR-003**: A community MUST be able to adopt an existing custom identity supplied to it, so
  a persona that already exists can be spoken through without being recreated.
- **FR-004**: Adoption MUST be a distinct, more-privileged act than creation and MUST NOT be
  the default path — the platform MUST treat a supplied identity as unproven and require a
  deliberate choice to accept it.

**Owning and listing faces**

- **FR-005**: Every face MUST belong to exactly one community, and every operation on a face —
  create, list, rename, re-avatar, delete, speak-through — MUST be confined to the community
  that owns it.
- **FR-006**: A community MUST be able to list its own faces, and that listing MUST reveal
  nothing about any other community's faces, including whether any exist. Listing, like
  creating, requires the platform to hold the management authority in that community; where it
  is absent, listing MUST fail clearly rather than return an empty or partial result that could
  be mistaken for "no faces".
- **FR-007**: A face owned by one community MUST NOT be nameable, reachable, or discoverable by
  any other community; an attempt to operate on another community's face MUST be refused and
  leave the face unchanged.
- **FR-008**: A spell MUST only be able to speak through a face owned by the same community as
  the spell.

**Speaking through a face**

- **FR-009**: A spell MUST be able to speak through a face, so its message appears under the
  face's chosen name and avatar rather than the platform's own identity.
- **FR-010**: The name and avatar a message appears under MUST be applied per message, so many
  faces MAY share one channel's delivery credential — the platform needs about one such
  credential per channel however many faces speak there.
- **FR-011**: A message spoken through a face MUST pass through the same single delivery point
  as a message the platform sends as itself; no path may bypass it.
- **FR-012**: A message spoken through a face MUST be subject to the same delivery guarantees
  as any other — acted on exactly once for a given event, and recorded with an outcome that
  matches reality.
- **FR-013**: A face's speaking credential MUST be stored and resolved by reference in the
  same protected way as every other credential — never rendered into a message, never returned
  in a listing, and never exposed in any browsable form.

**Modifying a face**

- **FR-014**: A community MUST be able to rename a face and change its avatar after creation,
  and the change MUST take effect on the face's next message with no restart or redeployment.
  Modifying a face is confined to its owning community by FR-005.

**Revoking a face**

- **FR-015**: A community MUST be able to delete a face, after which the platform can no longer
  speak through it.
- **FR-016**: When a spell is invoked against a face that no longer exists, the invocation MUST
  fail cleanly and be recorded as failed — never recorded or reported as delivered.
- **FR-017**: Deleting a face MUST NOT alter messages that face has already delivered; deletion
  revokes future use only.

**Preserved guarantees**

- **FR-018**: Introducing faces MUST NOT change how a message the platform sends as itself is
  produced, delivered, or recorded — speaking as the platform remains available and unchanged.
- **FR-019**: Delivery through a face MUST classify failures the same way delivery as the
  platform does — permanent refusals are not retried; temporary ones are retried a bounded
  number of times with increasing delays that honour any stated wait time.
- **FR-020**: The platform's core MUST remain free of any platform-specific notion of a face;
  the knowledge of how a face is created, listed, renamed, spoken through, and deleted MUST
  live only in the binding that owns that platform.

### Key Entities

- **Face**: A community-owned custom speaking identity — a name and an avatar — that a spell
  speaks through. Belongs to exactly one community and lives in one of its channels. A channel
  may hold many faces; they are all delivered through one **per-channel speaking credential**
  (a webhook) held in the protected credential store and reached only by reference — the
  credential is established when the channel's first face is created and retired with its last.
  A face is either _created_ (the platform establishes the channel's credential) or _adopted_
  (a supplied credential is accepted).
- **Spell (extended)**: A stored sentence may now name a face to speak through. A spell without
  a face speaks as the platform, exactly as before; a spell with a face speaks under the
  face's name and avatar. A spell may only name a face its own community owns.
- **Destination (extended)**: A channel a community owns may now host faces, up to that
  channel's hard cap on how many can exist in it.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A community owner can create a face and see a spell speak through it — a message
  arriving under a chosen name and avatar — without any code change or platform restart.
- **SC-002**: 100% of messages spoken through a face appear under the face's chosen name and
  avatar, never the platform's own identity.
- **SC-003**: In every attempted cross-community operation on a face (speak-through, list,
  rename, delete), 100% are refused, and no listing ever reveals another community's faces.
- **SC-004**: After a face is deleted, 100% of subsequent invocations that named it are
  recorded as failed and 0% are recorded or reported as delivered; no message appears.
- **SC-005**: A community can bring an existing persona under its book by adopting it, and its
  members see no change in the identity's name or avatar across the transition.
- **SC-006**: Adding, changing, or deleting a face is achieved entirely through the platform —
  a community owner never has to touch the underlying channel's own settings to manage a face.
- **SC-007**: Every outcome of a face operation and a face delivery is recorded truthfully —
  created, delivered, declined, refused, or failed — with zero cases of a face message reported
  delivered that did not appear.

## Assumptions

- The platform speaks in a community only where it has been admitted to that community, and
  creating or listing faces additionally requires a management authority that admission may or
  may not include; where it is absent, those operations fail clearly and the rest of the
  feature (adopt, speak-through, delete) still works.
- A channel imposes a hard limit on how many delivery webhooks can exist in it; because all of a
  channel's faces share one webhook (the name and avatar are per-message), the platform needs
  about one webhook per channel however many faces speak there, so the limit is not expected to
  bind in normal use.
- Faces are provisioned for communities that already exist in the platform (as they are seeded
  today); a self-service install flow is not assumed and is not required for this feature.
- The credential store, tenant ownership, the single delivery point, and the honest record all
  exist from spec 001 and are reused unchanged; this feature adds a new kind of destination
  identity, not a new delivery path or a new record.

## Out of Scope

These appear alongside faces in the predecessor's write-up but are separate features, each its
own later spec — not part of faces:

- **A management interface (the composer).** Faces here are provisioned through the platform's
  own operations, driven as the community's tenants are seeded today. A visual interface to
  create, list, and delete faces is the composer, a later spec.
- **Private and ephemeral output.** The choice of "who sees this?" — a private reply versus a
  public message — belongs to the interaction capability, which does not exist yet. This
  feature delivers only the public, custom-identity message; it does not build private or
  ephemeral replies, and by nature a face cannot produce one.
- **Install and uninstall lifecycle.** Self-service installation, and the cleanup of a
  community's live faces when it uninstalls, depend on an install flow that does not exist yet.
  Faces are live resources whose lifecycle-on-uninstall is noted as future work, not built
  here.
- **Rich message shapes (cards).** Making the message itself richer — a structured, coloured
  card rather than a line of text — is a separate axis (the message's shape, not its speaker)
  and its own later spec. Faces changes who speaks, not what the message looks like.
