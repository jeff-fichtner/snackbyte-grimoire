# Grimoire — design brief

Handoff for the design agent. Everything below is **decided** unless a section says
otherwise. `Grimoire.dc.html` (turn 1) proposed two directions; this brief picks one and
sets the rules for expanding it.

The authority for the product model is [`GRIMOIRE.md`](../GRIMOIRE.md) at the repo root,
and the law is [`.specify/memory/constitution.md`](../.specify/memory/constitution.md).
Where this brief and those disagree, they win — tell me instead of guessing.

---

## 1. What you are designing

**Grimoire is a platform for performative speech in chat communities.** A tenant (one
community — today, one Discord server) owns **spells**: stored sentences that *do things
when spoken*. Post as a persona when a webhook fires. Grant a role when someone reacts.
Reply with a taunt when someone runs `/spank`. The tenant composes spells without writing
code; the platform supplies the vocabulary, verifies who may speak, and delivers with
guarantees.

**Discord is the first binding, not the identity.** The core names no platform; further
platforms (Slack among them) are intended if wanted. Discord-specific chrome is allowed
only where it makes a screen concrete — a connection indicator, a channel name — never as
the organizing principle of a screen.

### Who the tenant actually is

This matters more than anything else in this brief. The tenant is **a person who cannot
ship code and never will** — in the founding case, the author's girlfriend and friends
running their own servers. They arrived to make one specific silly thing work. They are
not administrators of a platform, not engineers evaluating an architecture, and not
readers of a design document.

Design for that person. The model below is what makes the product *correct*; it is not
what the tenant came to look at.

---

## 2. The model (you need it; the tenant does not)

Two sides joined by one relation, walked at runtime by one traversal.

```
PLATFORM — one of everything · engineer-grown · code
├─ the LANGUAGE    what can be said      trigger species · logic forms · verb vocabulary · agreement rules
├─ the LAW         who may say it        authentication · tenant authority · member authority · layering
└─ the LOGISTICS   how it happens        media · guarantees · growth

TENANT — many of everything · owned rows · data
├─ SPELLS          the said              one trigger + logic + verb(s) + the nouns they reference
└─ NOUNS           the possessed         faces, secrets, targets, whitelists · records, state, logs
```

- **The vertical relation is pattern ↔ instance.** Every tenant row is an instance of a
  platform pattern; every pattern can enumerate its owned instances.
- **The horizontal relation is the invocation** — one traversal across both sides:
  `trigger → law admits → spell → logic → verb(s) → nouns → logistics performs`.
- **Three refusals, in order:** *unspeakable* (the law refuses — unauthenticated or
  unauthorized, at speaking time), *ungrammatical* (the language refuses — violates form
  or an agreement rule, **at authoring time**), *undeliverable* (logistics retries, backs
  off, records, and never reports done what did not happen).

### Charms and hexes

Verbs are classed, and this is the product's safety model:

- **Charms** — reversible, low blast radius. Post a message, toggle a whitelisted role,
  add a reaction. **Tenants may compose these freely.**
- **Hexes** — irreversible or high blast radius. Ban, kick, mass-delete. **Tenants may
  never compose these.** They exist only in engineer-authored spells, cast by a human
  exercising judgment, never automated.

The principle to render: **dangerous sentences are not rejected — they are ungrammatical.**
The editor refuses to let an illegal spell be written, rather than accepting it and failing
later.

### The two-way asymmetry (constrains the spell editor)

Messages flow two ways, but **no spell is required to use both**, and which directions are
available is a property of the *trigger species*:

| Trigger species | Return channel | Consequence for the spell |
|---|---|---|
| interaction (slash command, button, modal) | **yes — a reply is owed, promptly** | the only place a *private* reply is possible |
| external call (inbound webhook) | acknowledgment only | can speak outward, can never reply to an invoker |
| ambient event (reaction, member join) | none | may be entirely silent |
| clock (schedule) | none | may be entirely silent |

A reaction-role spell sends no message at all and that is not a defect. Speaking outward
is always available; speaking *back* exists only where the trigger opened the channel.

### The three agreement rules (cross-cutting legality)

1. **Audience** — a private reply requires an interaction trigger *and* the platform's own
   voice. **A custom face can never whisper.** Structural, not a gap.
2. **Authorship** — tenant-authored spells may use charms only; hexes require an
   engineer-authored spell with a human trigger.
3. **Standing** — a spell acting on a member is legal only if the speaker's authority
   covers both the verb and the target.

### The ceiling, and why it must be visible

Tenants compose sentences from a menu; **only engineering grows the menu.** That is
deliberate and permanent — tenant-authored *logic* would make this a code-hosting product.
So a tenant hitting the edge of the vocabulary is a **product signal, not a support
failure**: there must be a visible, dignified "request a verb" path. Treat it as a feature,
not an apology.

---

## 3. DECISION: expand 1b ("The Book")

**1b is the direction. 1a is not.**

### Why 1b

- **1a spends ~25% of permanent screen on state the tenant cannot act on.** Its own footer
  admits it: *"one of everything · engineer-grown. you compose within this grammar; you
  cannot change it."* A permanent column of read-only platform internals is the
  implementer's mental model rendered as furniture.
- **1a breaks precisely when the product succeeds.** The vocabulary is designed to grow
  without bound (verb families, trigger species, executor species). A permanent column
  enumerating them degrades into an unusable list at the best possible moment. 1b's
  "Grammar" page simply gets richer.
- **1b teaches the model better by not naming it.** The reading pane's
  **When / Who may / What happens / Guarantees** *is* trigger → law → logic+verb →
  logistics, taught through one concrete instance. That is the right pedagogy for a
  grammar: you learn it by reading sentences, not by studying an org chart of parts of
  speech.
- **1b puts the platform in the correct relationship** — "Grammar" and "Guarantees" as
  secondary nav means the platform is *reference you may consult*, never furniture you must
  navigate around.
- **1b leaves room for the actual product**, most importantly the spell composer, which
  needs a full canvas and is the payoff of the entire roadmap.

### Three grafts to take from 1a

1a gets one thing decisively better and two things worth keeping.

1. **The hex card treatment — take it wholesale.** 1a's locked hex is dark, rust-bordered,
   visually inert, and carries the explicit sentence: *"hexes cannot be composed by
   tenants. cast only by a human with standing — never automated."* 1b reduces the hex to
   a row with a lock icon and a shrug. That card is the safety model made visible and is
   what makes the ceiling read as principled rather than limiting. It belongs in 1b's
   reading pane and anywhere a hex is shown in detail.
2. **Per-row guarantee markers.** 1a badges each spell in the list (`✓ idempotent ·
   recorded`, `✓ deduped · recorded`). 1b reveals guarantees only after a spell is opened.
   These are the differentiator against webhook-relay products — surface them in the list.
3. **The `↑ instance-of · whose ↓` band.** The sharpest visual statement of the
   pattern↔instance relation in either mock — but it belongs on the **Grammar** page, not
   the home screen.

### What 1a becomes (do not discard it)

- **The Grammar page** — the full read-only catalogue: trigger species, logic forms, the
  verb vocabulary split into charms and hexes, the agreement rules, and the
  pattern↔instance band. This is also the natural home for **request-a-verb**.
- **The trace / invocation view — the more valuable reuse.** 1a's top spine
  (`trigger → law admits → spell → logic → verb → nouns → logistics`) is inert decoration
  on a static home screen, but it becomes excellent when *live*: watch a single invocation
  walk the spine, lighting each station, and show exactly where a refusal happened and
  which of the three kinds it was. That is the debugging surface and the best demo the
  product has.

---

## 4. DECISION: lexicon

**Rule: keep the craft word only where it does semantic work the plain word cannot.**

| Term | Verdict | Reasoning |
|---|---|---|
| **spell** | keep | universally inferable; the core noun |
| **charm / hex** | keep | load-bearing — encodes reversible-and-composable vs irreversible-and-engineer-only, which has no good plain-English pair. "Safe/dangerous action" is clumsy and reads as a warning label; charm/hex carries the danger gradient for free |
| **cast** | keep | reads naturally as verb and as a count (`cast 1,043×`) |
| **grimoire** | keep | the product name; self-teaching beside "6 spells" |
| ~~glamour~~ → **Faces** | **dropped** | a false friend: colloquially it means "attractive", so a first-time tenant reads it as *make it pretty* rather than *the identity the bot wears*. A word that misleads is worse than one nobody knows |
| **targets, secrets, records, triggers** | plain | already exact; a craft synonym only obscures |
| circle / ward, familiar, incantation | **doc-only** | see below |

**Why circle, familiar, and incantation stay out of the UI:**

- A **circle** (tenant isolation boundary) is an *invariant, not an object*. Nobody edits
  their circle — it either holds or there is a security bug. No screen, so no UI word.
  Note this is **not** a synonym for *targets*: targets are channels and destinations a
  tenant manages, with real CRUD.
- A **familiar** (the bot presence) collides with the highest-stakes moment in the product:
  Discord itself says "bot"/"app" during install. Do not add friction there.
- An **incantation** (speech-out, as distinct from invocation) is a distinction that earns
  its keep in the design document, not on screen.

**Net effect:** craft vocabulary for the things tenants *create and classify*; plain
vocabulary for the things they merely *point at*; architecture language stays in
`GRIMOIRE.md`. The theme survives intact — your book is a grimoire, it holds spells, each
is a charm or a hex, and you cast them — and the plain supporting cast makes those words
land harder.

---

## 5. Design system (extracted from turn 1 — keep it)

The visual language in `Grimoire.dc.html` is approved. Do not restyle; extend.

### Typography

| Family | Role |
|---|---|
| **Spectral** (serif) — 300/400/500/600/700 + italic | spell names, page titles, tenant name. The literary voice |
| **Hanken Grotesk** (sans) — 400/500/600/700 | UI chrome, nav, buttons, body copy |
| **JetBrains Mono** — 400/500/600 | the spell sentence itself, metadata, counts, labels, uppercase micro-headings (letter-spacing ~0.14em) |

The spell *sentence* is always mono — it reads as language with syntax, which is the point.

### Palette

Dark shell, parchment for the artifact.

| Token | Value | Use |
|---|---|---|
| canvas | `#0b0a08` | outermost background |
| shell | `#15120e` | app frame |
| chrome | `#12100c` | top bar, sidebar |
| panel | `#13110c` / `#100e0a` | secondary columns |
| inset | `#181510` / `#1c1813` | cards, fields inside dark |
| **parchment** | `#e7ddc6` | **the spell as an artifact** — reading pane, spell cards |
| hex surface | `#221d17` | locked/irreversible surfaces |

| Semantic | Value(s) | Meaning — keep these consistent |
|---|---|---|
| **gold** | `#cda349`, hover `#e4c374`, dim `#b58a2e`, `#c9b06a` | tenant / owned / primary action |
| **purple** | `#9089bf`, on parchment `#6a4fa0` | the language — triggers, logic, conditions |
| **green** | `#86a06f`, on parchment `#4f7a3e` | logistics, guarantees, healthy/active |
| **rust** | `#bb6647`, `#c98d72`, `#d18a6c` | hexes, irreversibility, danger |
| **discord blue** | `#7f8cf0`, `#aeb6f5`, `#9aa4f2` | binding-specific chrome **only** |

Text on dark: `#e9e1d1` primary → `#c9c0ad` → `#a89f8e` → `#9c9382` → `#8a8272` →
`#6a6357` → `#5c564b`.
Ink on parchment: `#26221a` primary, `#4a4436` body, `#6f6653` secondary, `#a08a4e` /
`#8a7a52` labels.
Borders: `rgba(232,224,208,0.08–0.14)`. Selection: `rgba(205,163,73,0.28)`.

**The color rule worth protecting:** gold = the tenant's, purple = the language, green =
guarantees, rust = danger, parchment = the spell itself. A reviewer should be able to
read the model off the palette without reading a word.

### Frame

1240 × 840 mock. Top bar 58px. Sidebar 216px. Reading pane 352px. Cards ~7px radius,
`0 2px 0 rgba(0,0,0,0.25), 0 14px 26px -18px rgba(0,0,0,0.6)`. Custom thin scrollbars via
`.cvs-scroll`.

---

## 6. Invariants that must survive into every screen

1. **The tenant never sees another tenant.** One community at a time; the switcher is the
   only place plurality appears.
2. **A hex is never composable.** Any UI that would let a tenant assemble one is wrong.
3. **Impossible combinations are refused at authoring time**, with a reason — never
   accepted and silently half-dropped. Especially: no private reply from a face; no reply
   at all from a trigger with no return channel.
4. **Secrets are references, never values.** Never render a secret, a token, or a webhook
   URL. A webhook URL is a credential, not an address.
5. **Guarantees are claims the product must honor** — deduped, retried, recorded, never
   reports done what did not happen. Show them; do not overstate them.
6. **The core names no platform.** Discord appears as a binding, never as the structure.

---

## 7. Anti-patterns

- Rendering the platform's internals as primary navigation (the 1a failure).
- Craft vocabulary applied decoratively — renaming things the tenant merely points at.
- A settings-shaped app. This is a **book of spells**, not a control panel; the home screen
  should read as a reading surface with one obvious creative act (`+ New spell`).
- Dashboards of metrics as the landing experience. Counts belong beside their spell.
- Treating the vocabulary ceiling as an error state rather than an invitation.

---

## 8. Deliverables

### Turn 2 — DELIVERED (`Grimoire.dc.html`, sections 2a/2b)

- **2a Home** — per-row guarantee markers, and the hex row carrying real weight.
- **2b The Grammar page** — the vocabulary catalogue split charms/hexes, trigger species
  with their return-channel asymmetry stated inline, logic forms, the three agreement
  rules, the pattern↔instance band, ending in request-a-verb.

**One decision made in turn 2 that is now binding — the hex inversion.** Opening a hex
turns the reading page from warm parchment into a cold, sealed slab. This is better than
the graft that was asked for, and it should be treated as a rule rather than a flourish:
**parchment means "the tenant's own artifact."** A hex is not the tenant's, so it does not
get parchment. Any future surface showing a hex inherits this.

Request-a-verb copy is likewise approved as written, including its framing — *"That's not
a wall — it's a signal… the surest way we learn what to add next is the spell you couldn't
quite write."*

### Turn 3 — DELIVERED (sections 3a/3b/3c)

- **3a The spell composer** — `WHEN / IF / DO / SEEN BY`, filled from a menu scoped to what
  is legal. It took the sentence-builder over the form. Hexes are **structurally absent**
  from the menu rather than disabled; reply verbs are refused in place, with the reason,
  when the trigger owes no reply.
- **3b The empty book** — a blank first screen with one clear act, plus three
  engineer-written spells offered as starting pages.
- **3c First binding** — install, with ownership **verified rather than claimed** (an
  unmanaged server shows `needs Manage Server`), closing on "Discord is the first binding —
  not the whole book."

### Turn 4 — DELIVERED (sections 4a/4b/4c)

- **4a Records + the live trace** — the ledger, and the invocation spine walked for one
  refused call, stopping at the exact station that turned it away.
- **4b A spell failing for three days** — undeliverable: the retry timeline, the give-up,
  and "3 casts are **held, not lost**."
- **4c The states board** — buttons, status seals, the three refusals, form controls,
  toasts, confirm-a-hex, skeletons, and the focus ring (gold; rust on irreversible actions).

**Binding rule from 4a — opacity is a security property, not a copy choice.** Where the law
declines to say whether a caller was unknown or forged, no surface may say either. A more
"helpful" message would leak exactly what an attacker is probing for. This is now enforced
by a test, not merely documented.

### Implemented so far

2a (home, tokens, the hex inversion) and 4a (Records, trace, outcome vocabulary), plus 4c's
focus states. Designed but unbuilt: 2b, 3a, 3b, 3c, 4b, and the rest of 4c.

### Next

Unrequested and still open: the **Faces / Secrets / Targets** screens — Secrets is the
interesting one, a screen whose whole job is managing things it must never display — the
**Guarantees** page, and a **responsive** answer. The last is a real gap rather than a
nicety: below 1100px the reading pane hides and nothing replaces it, so a narrow user can
browse the book but never open a spell.

---

## 9. Open — not decided, do not assume

- **The spell composer's interaction model.** Deliberately unspecified. It is the hardest
  screen and gets its own round.
- **Whether the invocation/trace view ships early or late.** The design is wanted; the
  sequencing is not settled.
- **Onboarding and the install flow** — untouched so far, and it is where a tenant's very
  first impression happens.
- **Empty states.** A brand-new tenant has zero spells, and that screen is arguably more
  important than the populated one shown in turn 1.
- **Responsive / smaller viewports.** Turn 1 is a fixed 1240×840 desktop frame only.
