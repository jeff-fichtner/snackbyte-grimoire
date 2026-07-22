# The Grimoire

> "The uttering of the words is, indeed, usually a, or even the, leading incident in the
> performance of the act." — J.L. Austin, _How to Do Things with Words_

Grimoire is a platform where chat communities own **spells** — stored sentences that _do
things_ when spoken — cast with verified authority and delivered with guarantees. It is
platform-agnostic by design: **Discord is the first binding**, and the architecture intends
a handful of further platforms (Slack among them) if and when they are wanted. Nothing in
this document names a platform except the section that binds one.

This document is the design element the whole system answers to. The constitution
(`.specify/memory/constitution.md`) makes it law; specs implement it; code obeys it.

---

## 1. The concept: speech that acts

Ordinary messages _describe_. A performative utterance _does_ — "I now pronounce you," said
by the right person under the right conditions, changes the world. Austin's insight was
that such speech has three requirements: a **conventional form** (the words must be a
recognized formula), **felicity conditions** (the speaker must hold the standing — the
marriage words do nothing said by a bystander), and **execution** (the act must actually be
carried out).

Grimoire is a machine for performative speech in chat communities. Its three platform
branches are Austin's three requirements, engineered:

| Austin              | Grimoire          | Question it answers                      |
| ------------------- | ----------------- | ---------------------------------------- |
| Conventional form   | **the Language**  | what can be said?                        |
| Felicity conditions | **the Law**       | who may say it, here, to whom?           |
| Execution           | **the Logistics** | how does it physically, reliably happen? |

## 2. The unifying relation: patterns and instances

The system has exactly two sides, and one edge joins them:

- **The platform** owns _patterns_: one language, one law, one logistics. Engineer-grown,
  one of everything, code.
- **Tenants** own _instances_: their spells and their nouns. Many of everything, data,
  every row possessed by exactly one owner.

Every tenant-side thing is an instance of a platform-side pattern, and the edge is
traversable in both directions: upward, every instance can name its pattern ("instance of
what?"); downward, every pattern can enumerate its owned instances ("whose?"). The two
sides meet only at run time, in the **invocation** — the moment a sentence is actually
spoken. Statically the system is shelves of language and books of spells; it _exists_ only
while invocations walk it.

## 3. The structure

```text
PLATFORM — one of everything · engineer-grown · code
├─ the LANGUAGE   what can be said
│    ├─ trigger species    external calls · interactions · ambient events · clock
│    │                     (each species declares its return channel — see §5)
│    ├─ logic forms        predicates (whether) · transforms (what shape) — pure & total:
│    │                     bounded iteration, typed conditions, no eval, no portals
│    ├─ verb vocabulary    message verbs · state verbs · record verbs
│    │                     └─ two classes: CHARMS (reversible, low blast radius — tenants
│    │                        may compose) and HEXES (irreversible — engineer-authored
│    │                        sentences only, cast by human judgment)
│    └─ agreement rules    cross-part legality (§6)
│
├─ the LAW        who may say it — four questions, never merged
│    ├─ authentication     is the claimant genuine? (signatures on exact bytes,
│    │                     platform-verified ownership, minted-not-pasted credentials)
│    ├─ tenant authority   does this tenant own this community at all?
│    ├─ member authority   does this speaker hold this power, here, over this target?
│    └─ the layering rule  platform things never pretend to be tenant-scoped; identity is
│                          derived, never accepted — no sentence may carry its own speaker
│
└─ the LOGISTICS  how it happens
     ├─ media        the physical channels, both directions (per binding)
     ├─ guarantees   idempotency & dedupe · rate-limit respect · fairness across tenants ·
     │               retry/backoff · outcome recording
     └─ growth       new capacity species — session executors, connection pools,
                     bring-your-own-application — each a deliberate platform-shape change

TENANT — many of everything · owned rows · data
├─ SPELLS   stored sentences: one trigger + logic + verb(s) + the nouns they reference.
│           A tenant's book of spells is their grimoire. Engineer-written spells shipped
│           as defaults are templates; tenant-written spells are the product.
└─ NOUNS    owned things: resources (faces, secrets-by-reference, targets, whitelists)
            and records (state, histories, logs)
```

## 4. The invocation: one walk across both sides

Every feature — every one — is the same left-to-right trip, differing only in which
stations do non-trivial work:

```text
trigger  →  law admits  →  spell  →  logic  →  verb(s)  →  nouns  →  logistics performs
[language]  [law]          [TENANT]  [language] [language]  [TENANT]   [logistics]
```

Three refusal points, in order, each guarding a different catastrophe:

1. **Unspeakable** — the law refuses: unauthenticated, unowned, or unauthorized. Refused
   at speaking time.
2. **Ungrammatical** — the language refuses: the sentence violates form or an agreement
   rule. Refused at _authoring_ time — the editor will not let an illegal spell be written.
3. **Undeliverable** — the logistics refuses to lie: it retries, backs off, records the
   outcome, and never reports done what did not happen.

The safety model in one sentence: **dangerous sentences are ungrammatical; unauthorized
utterances are unspeakable.**

## 5. Invocation and incantation: the two-way asymmetry

Messages flow two ways, but no feature is required to use both. The pair of words carries
the asymmetry:

- An **invocation** is the in-way: the summons. Every feature has one — even silent ones.
- An **incantation** is the out-way _when the outcome is speech_: a sentence said aloud,
  once. Not every invocation incants (a reaction that toggles a role is a wordless charm);
  no incantation happens uninvoked.

The asymmetry is a property of **trigger species**, not of the app: some species open a
**return channel** (an interaction owes its invoker a reply, promptly, and only there can
a reply be private); others carry no return channel at all (an external call gets a bare
acknowledgment; ambient events and the clock answer to no one). Speaking _outward_ is
always available; speaking _back_ exists only where the trigger opened the channel.

## 6. Agreement rules

Cross-part constraints that make a spell legal or refusable — the grammar's syntax:

- **Audience agreement** — private speech requires a return channel (an interaction
  trigger) and the platform's own voice; a face can never whisper. No private message from
  a custom face — structural, not a gap.
- **Authorship agreement** — tenant-authored spells may use charms only. Hexes appear only
  in engineer-authored spells with a human speaker exercising judgment.
- **Standing agreement** — a spell acting on a member is legal only if the speaker's
  authority covers the verb _and_ the target, checked against the community's own power
  structure at speaking time.

## 7. The drawn lines

Boundary adjudications, so every future piece lands in exactly one place:

- **Trigger vs Law** — a trigger is untrusted until the law admits it. An identifier in an
  inbound path is trigger-data, a lookup hint; _believing_ it is the law's job, and an
  unknown identifier fails exactly like a forged signature.
- **Logic vs Verb** — "post only if X": the _if_ is logic, the _post_ is a verb. What
  cannot change the world composes freely; what can is a verb and faces the charm/hex line.
- **Verb vs Logistics** — "say this" is a verb; retrying, deduplicating, and rate-limiting
  it is logistics. **A verb never knows about rate limits; a spell never knows about
  media.**
- **Spell vs Noun** — stored bindings are _spells_ (compositions); nouns are what spells
  point at. A routing rule is a spell; the webhook it feeds is a noun.
- **Law vs Noun** — if deleting a row changes _who may act_, it is the law's ledger; if it
  changes _what exists to act on_, it is a noun.
- **Noun vs platform configuration** — if a second tenant would need a different value, it
  is a noun (data); if genuinely process-wide, it is configuration, which sits outside the
  model entirely (the stage, not the play).

## 8. Growth: additive, never rework

The platform cannot make hard things cheap; it makes hard things **additive**. The
language grows verb by verb, trigger species by trigger species — and a tenant who reaches
the edge of the vocabulary is a _signal_, not a support ticket: the request-a-verb loop is
the product's growth mechanism.

Some features are ordinary verbs whose **executor species** does not exist yet: anything
session-shaped (streaming audio, live transcription, real-time presence) needs logistics
that hold long-lived sessions rather than fire effects. Those arrive as new logistics
species behind seams built for exactly that purpose — every consumer resolves its
connection by application identity, every effect flows through one chokepoint — so the
day they are wanted, they are added, and nothing above them moves. The guarantee, stated
exactly: **you pay a hard feature's own irreducible price, never that price times a rework
of the foundation.**

## 9. The market, factored

The existing market sells three regions of this one grammar as three separate products:

| Product category                       | In grammar terms                            | Their ceiling                                                                                                     |
| -------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Integration platforms (webhook relays) | external trigger species + one message verb | no presence in the community: no law, no interactive triggers                                                     |
| Feature bots (prebuilt catalogues)     | engineer-authored spells with config knobs  | owners rent fused sentences; they never get the grammar                                                           |
| No-code bot builders                   | a spell editor                              | vocabulary is not total (arbitrary logic in a flowchart costume) and every owner must bring their own application |

Grimoire is the factorization: one language, one law, one logistics — with integrations,
catalogues, and composition as _regions of the same grammar_, sharing five of six parts and
differing only in who authored the spell and which trigger species fires it.

## 10. Bindings

A **binding** is a platform's concrete surface mounted onto the model: its trigger species,
its media, its law hooks (how speakers and their powers are verified there). **Discord is
the first binding.** The model reserves room for a handful more — a workspace with a warded
circle and a familiar in it is not a Discord idea — and each further binding must arrive as
an instance of the same patterns: new species and media, same language, same law, same
guarantees. Nothing in the core may name a binding.

## 11. Provenance

Grimoire is founded on the lessons of a complete, working predecessor —
`snackbyte-discord`, a Discord integration hub built spec-by-spec over a month, which ended
as what it turned out to be: **one large proof-of-concept**. Its shipped behavior, its
constitution, and above all its late-arriving clarity about tenancy, composition, and
totality are the input to this document. The predecessor remains the archaeology; this book
is the fresh start that does it right the first time.
