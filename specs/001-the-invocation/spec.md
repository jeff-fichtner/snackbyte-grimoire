# Feature Specification: The Invocation

**Feature Branch**: `spec/001-the-invocation`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "The invocation — the walking skeleton, tenant-first. One complete walk of trigger → law admits → spell → logic → verb → nouns → logistics performs, with every station doing its minimum non-trivial work, and tenancy present from the first row written."

---

## Why this feature exists

Grimoire lets a community own **spells** — stored sentences that do something when spoken.
This feature makes the first spell speakable end to end: an event arrives from outside, the
platform proves whose it is, the owning community's spell decides what to say, and it is
delivered exactly once with an honest record of what happened.

It is deliberately one thin slice through every part of the system rather than one part
built completely. A community that cannot get a single spell to work has no product, and no
single station can be judged alone — a trigger nobody is allowed to act on, or a delivery
with nothing to deliver, proves nothing.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A community's first spell speaks (Priority: P1)

A community owner has a spell in their book: when their project publishes a release, the
book announces it in a channel they chose. The release happens. The announcement appears,
once, worded the way their spell says.

**Why this priority**: This is the product's minimum viable sentence. Everything later is
more spells, more ways to start one, and better ways to write them — but if one spell
cannot travel from an outside event to a delivered message, none of that matters.

**Independent Test**: Configure one community with one spell and one destination, send a
real event from the outside source, and observe the message arrive with the spell's
wording. Fully testable without any other user story.

**Acceptance Scenarios**:

1. **Given** a community owns a spell that announces releases to a chosen channel, **When**
   a genuine release event arrives for that community, **Then** exactly one announcement
   appears in that channel, worded by the spell.
2. **Given** the same setup, **When** the owner edits the spell's wording, **Then** the next
   event uses the new wording with no restart or redeployment.
3. **Given** a spell whose condition excludes a kind of event, **When** an excluded event
   arrives, **Then** nothing is announced, and the outcome is recorded as declined rather
   than as a failure.

---

### User Story 2 - One community can never reach another's book (Priority: P1)

Two communities use the platform. Each owns its own spells, destinations, and credentials.
Neither can cause anything to happen in the other's community, and neither can learn the
other exists.

**Why this priority**: Equal to Story 1 and inseparable from it. The platform serves
independent owners, so an invocation reaching the wrong book is not a defect to fix later —
it is the failure that makes the product unshippable. Retrofitting this is precisely what
made it expensive in the predecessor system; built first, it is nearly free.

**Independent Test**: Configure two communities with their own spells and credentials, then
attempt every crossing: send one community's event bearing the other's credential, address
one community with the other's identifier, and attempt to make a request name the community
it wants to act as.

**Acceptance Scenarios**:

1. **Given** two communities each with a spell, **When** an event authenticated for
   community A arrives, **Then** only A's spells are considered, and nothing in B's book is
   read or acted on.
2. **Given** an event, **When** the request itself claims which community it belongs to,
   **Then** the claim is disregarded entirely — ownership is determined only from what the
   platform can independently verify.
3. **Given** an event carrying a valid credential belonging to community A, **When** it is
   sent to community B's address, **Then** it is refused, and nothing is delivered to
   either community.

---

### User Story 3 - The record is trustworthy (Priority: P2)

Every invocation leaves a durable, accurate record of what actually happened: what was
delivered, what was correctly skipped, what was declined, what was refused, and what failed.
Nothing is ever recorded as done that did not happen. The record is complete and truthful
enough to be shown to an owner — the surface that shows it is a later feature.

**Why this priority**: The honest record is the platform's central promise and what
separates it from a simple relay. It is P2 only because the first two stories must exist
for there to be anything to record.

**Independent Test**: Drive one event of each kind — delivered, duplicate, declined by
condition, refused, and undeliverable — and confirm the recorded outcome matches reality in
every case.

**Acceptance Scenarios**:

1. **Given** an event that was delivered, **When** the identical event is received again,
   **Then** no second message appears, and the repeat is recorded as a skipped duplicate.
2. **Given** the destination is rejecting messages, **When** an event arrives, **Then** the
   platform retries a bounded number of times, then records a failure — and never records
   it as delivered.
3. **Given** the outside source resends an event it believes was not accepted, **When** it
   arrives again, **Then** the community sees no duplicate message.

---

### Edge Cases

- **An unknown caller and a forged one must be indistinguishable.** A request bearing an
  unrecognized community identifier and a request bearing a bad signature receive the same
  response, with no difference in wording, status, or timing that would let a prober learn
  which communities exist.
- **The destination is temporarily unavailable.** Temporary rejections are retried with
  growing delays, honouring the destination's own stated wait time; permanent rejections
  (the destination no longer exists, or permission was withdrawn) are not retried at all.
- **A destination or credential is removed between arrival and delivery.** The invocation
  fails cleanly and is recorded as failed; nothing is reported delivered.
- **The platform's store is unreachable.** Ownership cannot be established, so nothing is
  acted on, and the source is answered in a way that invites it to resend rather than to
  treat the event as consumed. The platform still reports itself alive — it is running and
  will serve again the moment the store returns — while reporting itself not ready.
- **A malformed or oversized payload arrives.** It is refused without being parsed into
  anything the rest of the system acts on.
- **The same event arrives twice concurrently.** Exactly one message results.

## Requirements _(mandatory)_

### Functional Requirements

**Arrival and admission**

- **FR-001**: The platform MUST accept events from an outside source at an address that
  identifies which community the event is for, and MUST answer the source promptly enough
  that it does not consider the delivery failed and resend.
- **FR-002**: The platform MUST verify an event's authenticity against a credential
  belonging to the addressed community, using the exact bytes received, before that event is
  parsed, matched, or acted on in any way.
- **FR-003**: The identifier in the address MUST be treated as untrusted — it selects which
  credential to check and grants nothing on its own.
- **FR-004**: An event that fails verification and an event addressed to an unrecognized
  identifier MUST be refused identically — the same response, with no timing difference that
  distinguishes them.
- **FR-005**: When authenticity cannot be established because the platform's own store is
  unavailable, the platform MUST refuse in a way that causes the source to retry rather than
  to treat the event as consumed.

**Ownership**

- **FR-006**: Every stored item MUST belong to exactly one community, and every read and
  write MUST be confined to a single community's items.
- **FR-007**: The identity of the community an invocation acts for MUST be derived from what
  the platform verified, and MUST NOT be constructible from anything the request supplied.
- **FR-008**: It MUST be impossible for a request to cause the platform to act as any
  community other than the one whose credential it proved.
- **FR-009**: Two communities MUST be able to use the same outside source independently,
  with separate credentials and separate spells. Neither community's registration may
  displace the other's, and neither may be visible to the other.

**The spell**

- **FR-010**: The platform MUST match an arriving event to the spells of its owning
  community and act on every spell that matches, independently — one spell's failure MUST
  NOT prevent another's delivery.
- **FR-011**: Spells MUST be read at the moment of the invocation, so an owner's edit takes
  effect on the next event with no restart or redeployment.
- **FR-012**: A spell MUST be able to decline an event by condition, and a declined event
  MUST be recorded distinctly from a failure.
- **FR-013**: Conditions and wording rules MUST be limited to a bounded, typed vocabulary
  with no ability to run arbitrary logic, reach the network, or read the platform's
  environment. This vocabulary MUST be the system's only rule language.

**Delivery**

- **FR-014**: All outbound messages MUST pass through a single point that applies the
  platform's delivery guarantees; no path may bypass it.
- **FR-015**: The same event MUST NOT cause the same spell to act twice, including when it
  arrives concurrently or is resent later.
- **FR-016**: Delivery MUST distinguish temporary failures from permanent ones: temporary
  failures are retried a bounded number of times with increasing delays that honour the
  destination's stated wait time; permanent failures are not retried.
- **FR-017**: Every invocation MUST record its outcome — delivered, skipped as duplicate,
  declined by condition, refused, or failed — and the platform MUST NEVER record as
  delivered anything that was not.
- **FR-018**: Credentials MUST be stored and used by reference; their values MUST NOT appear
  in browsable data, in logs, or in any response.
- **FR-019**: Communities share the platform's capacity to speak to a destination. One
  community's burst MUST NOT prevent another's messages from being delivered; the single
  delivery point MUST arbitrate that shared capacity fairly.

**Serving**

- **FR-020**: The platform MUST report itself alive independently of whether the destination
  platform or its own store is reachable, and MUST report readiness separately.
- **FR-021**: The platform MUST be deployable from a clean checkout by an automated process,
  and MUST run as a service the outside source can reach.
- **FR-022**: The platform MUST NOT depend on any single community's configuration in order
  to start, or in order to serve other communities.

**Extensibility**

- **FR-023**: Adding a second kind of event source, a second destination platform, or a
  second way of starting a spell MUST NOT require changing the parts of the system that
  match spells, enforce ownership, or deliver messages.
- **FR-024**: No part of the system outside the destination-specific layer may be written in
  terms of a particular chat platform.
- **FR-025**: The identity the platform speaks as on a destination platform MUST be stored and
  resolved as data, never fixed when the service starts. Adding a second such identity — one
  belonging to a community rather than the platform, or one of several sharing the load — MUST
  be achievable by adding data, without changing how any spell is matched, delivered, or
  recorded.

### Key Entities

- **Community** — an independent owner of a book. Everything else belongs to exactly one.
- **Platform identity** — who the platform speaks as on a destination platform, and the
  reference to the credential it speaks with. Belongs to the platform rather than to any
  community, and is looked up rather than assumed, so that a second one is only ever more data.
- **Install** — the recorded fact that the platform may act in one particular community. Set
  up by hand in this feature; the flow that establishes it is a later feature.
- **Spell** — a stored sentence owned by a community: what starts it, an optional condition,
  what it says, and where it says it.
- **Source registration** — a community's relationship with one outside event source,
  including the reference to the credential proving an event genuinely came from it.
- **Destination** — a place a spell can speak, owned by a community.
- **Credential reference** — a name standing in for a secret value held elsewhere.
- **Record** — the durable outcome of one invocation, including enough to prove a repeat was
  correctly ignored.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A community owner goes from a configured spell to a delivered message
  triggered by a real outside event, with nobody deploying or restarting anything.
- **SC-002**: An owner changing what a spell says sees the change take effect on the very
  next event.
- **SC-003**: Across a test attempting every crossing between two communities, no attempt
  causes any effect in the other community, and no response reveals whether the other
  community exists.
- **SC-004**: An event resent by the outside source any number of times produces exactly one
  message.
- **SC-005**: With the destination made to fail, once retries are exhausted 100% of affected
  invocations are recorded as failed and 0% are recorded as delivered.
- **SC-006**: With the destination unavailable and later restored, the platform recovers
  without a restart and without operator intervention.
- **SC-007**: A reviewer reading the record can determine, for every event in a session,
  which of delivered / duplicate / declined / refused / failed occurred.
- **SC-008**: Adding a second community requires only adding data — no code change and no
  deployment.
- **SC-009**: A misconfigured or broken community cannot prevent the platform from serving
  any other community.
- **SC-010**: An automated deployment from a clean checkout produces a running, reachable
  service, with no manual step beyond supplying credentials.

## Assumptions

- **One outside source and one destination platform are enough to prove the walk.** A second
  of either is a later feature; the requirement here is only that adding one changes nothing
  in the shared parts.
- **One way of starting a spell is enough.** Only events arriving from outside are in scope.
  Spells started by a person acting in the community, by something happening in it, or by a
  schedule are later features.
- **The first destination platform is Discord**, because that is where the first communities
  are. It is treated as the first of several, never as the system's identity.
- **Only reversible, low-consequence actions are in scope.** Speaking into a channel is in
  scope; irreversible acts against members are not — they are a distinct class with their
  own rules, and they arrive later.
- **Owners are set up by hand for now.** Self-service sign-up and connecting a community
  through the chat platform are a later feature; this one assumes a community and its
  credentials already exist in the store.
- **The bounded rule vocabulary starts minimal** — one kind of condition and one kind of
  wording rule. It is fixed here as the single rule language so that a second dialect cannot
  appear later.
- **Deployment targets a fresh, separate service** from the predecessor system, so the two
  can run side by side and traffic can be moved one source at a time.
- **Proven existing logic is reused where it already takes its context as arguments** — the
  wording rules, the source parsing, and the classification of temporary versus permanent
  delivery failures. Reproducing these from memory would reintroduce solved problems.

## Out of Scope

- Ways of starting a spell other than an outside event: commands invoked by a person,
  reactions and joins, and schedules.
- Irreversible actions against members.
- The interface for composing spells, and any self-service management surface.
- Signing in, verifying that someone runs a community, and installing the platform into one.
- Custom identities a spell can speak as.
- A second outside source, and a second destination platform.
- Durable queueing of events across a crash, metrics and alerting, and any stateful feature
  such as counters, histories, or scheduled follow-ups.
