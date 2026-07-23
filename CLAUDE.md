This project is **Grimoire** — a platform for performative speech in chat communities:
tenants own **spells** (stored sentences that do things when cast) and **nouns**; the
platform is a **language** (what can be said), a **law** (who may say it), and a
**logistics** (how it happens). Every feature is one **invocation** walking
trigger → law → spell → logic → verbs → nouns → logistics. Read `GRIMOIRE.md` before
designing anything — it is the design element everything answers to, including the
lexicon (spells, charms/hexes, faces, circles, familiars) and the agreement rules.

**Discord is the first binding, not the identity.** Core code never names a platform;
bindings own their SDKs and mount trigger species, media, and law hooks onto the model.
Further bindings (Slack among them) are intended if wanted.

**Greenfield discipline:** the predecessor repo (`~/snackbyte/code/snackbyte-discord`,
private, deprecated at parity cutover) is REFERENCE ONLY — one large proof of concept. It
keeps serving the live service until Grimoire cuts over onto a **new** Cloud Run service;
never edit it — any commit to its main triggers a deploy. **Read `MIGRATION.md` before
opening any file of it.** It defines the argument-vs-ambient test, the three tiers (lifts
with its tests / reshape / never open), what is deliberately left behind, and the cutover
sequence. Greenfield means no file survives unexamined and all wiring is new — not that
tested pure functions get retyped.

Spec-driven development via GitHub Spec Kit: principles live in
`.specify/memory/constitution.md`; specs go on `spec/NNN-*` branches, never on main until
built. The spec series is designed from the model's structure — when cutting new specs,
place every piece in exactly one part of the grammar and name the agreement rules it must
satisfy.

**Versioning tracks the spec series — the minor equals the spec number.** `package.json`'s
`MAJOR.MINOR` is the source; CI (`snackbyte-release-flow-action`, `version-strategy: build-id`)
derives the PATCH — **never write the patch.** The **minor is the spec number** (spec 002 →
`0.2`, spec 003 → `0.3`), and it is bumped exactly once, **when the `spec/NNN-*` branch is
created** — that branch creation IS the bump, and `/speckit-git-specify-branch` performs it.
(Spec 001 shipped at `0.2`; treat that as a legacy off-by-one, not the rule.) Do **NOT** bump the
minor for operational or non-spec work (wiring a source, infra/config, template edits — that work
rides the current minor), nor a second time on the same spec, nor on merge, nor to dodge a tag
collision (fix the collision, do not invent a version). A stray bump is **UNDONE — rewritten out
of history, not reverted forward — and its tags deleted.**
