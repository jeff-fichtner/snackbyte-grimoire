# Migration — from `snackbyte-discord` to Grimoire

Grimoire supersedes `~/snackbyte/code/snackbyte-discord` (private): a working, deployed,
single-tenant Discord hub — 6 shipped specs, 4,319 lines of `src`, 2,737 lines across 29
test files, live on Cloud Run as v0.6.2.

**It is reference only, and it is load-bearing.** It keeps serving production until parity
cutover, so nothing in it gets edited — any commit to its `main` triggers a deploy. This
document is the doctrine for how its contents cross over. Read it before opening a single
file of it.

## Why the reset was cheap

The predecessor's roadmap priced `007-tenancy-foundation` as the bottleneck gating
everything after it — `tenants`/`installations`/`applications`, `tenant_id` on every row, a
scoped repository, killing the boot-time singletons. It was expensive there because it was a
**retrofit** of identity that had already fused to the process.

From zero it is simply what the schema is. That entire cost line disappears, and it is the
single biggest return on the reset. **007 is never completed — it is voided**, and its
substance lands as the substrate of spec 001.

The corollary matters just as much: the predecessor's dependency graph inverts. There, 007
gated 008–018 because building any of them first meant building them single-tenant and
reworking them. Here there is no such gate, so the wide fan-out its roadmap promised "after
007" is available from spec 002.

## The test that sorts the codebase

> Does this file take its context as **arguments**, or reach for it in **module/process
> scope**?

Constitution VIII already states it — _tenant identity is an argument, never an ambient_ —
and it happens to sort the predecessor automatically, because its capability layer was
written pure.

Greenfield discipline means **no file survives unexamined and all the wiring is new**. It
does _not_ mean retyping pure functions. Copying a tested, argument-taking,
production-validated function is not the risk the rule protects against; inheriting
single-tenant wiring by osmosis is — and Tier 3 never being opened is what prevents that.

## The three tiers

### Tier 1 — lifts nearly verbatim, with its tests attached (~1,100 lines)

`src/bot/members/` (284) · `src/bot/moderation/standing.ts` + `guards.ts` (95) ·
`src/routing/transforms/` · the adapters' parse/normalize logic in `src/sources/`

Note the split inside `src/bot/moderation/` (418 lines total): **`standing.ts` (52) and
`guards.ts` (43) are Tier 1** — they answer _does this speaker's authority cover this verb
and this target?_, which is the Law's member-authority question and the only way agreement
rule 3 (Standing) can be enforced. **`sanctions.ts` (191) and `channel.ts` (132) are the
hex verbs**, and they are deferred rather than lifted — see below.

Already tenant-safe by construction — context arrives as parameters. `src/bot/members/roles.ts`
is the proof: 188 lines, zero imports, `RoleView`/`MemberView` interfaces instead of live
Discord objects, structured outcomes, never throws. In Grimoire's vocabulary these are
already **verbs**.

This is where the _earned_ knowledge lives, and it is the reason the tier exists:

- role-hierarchy escalation guards
- the grant-vs-remove asymmetry
- reaction provenance rules
- Discord's permanent-vs-transient error classification (401/403/404 vs 429/5xx +
  `Retry-After`)

Retyping that from memory reintroduces bugs already paid for. The tests come with it — the
predecessor's 29 test files are the acceptance criteria for anything rebuilt.

### Tier 2 — correct logic, wrong signatures (~1,000 lines)

`src/routing/engine.ts` · `src/db/repository.ts` · `src/discord/delivery.ts`

`engine.ts` **is already the invocation walk**: match → dedupe → filter → transform →
deliver → record. The shape is right. What is wrong:

- `findEnabledRoutes(source, eventType)` takes no tenant
- core imports `DeliveryService` from `../discord/` — a core→binding dependency that must
  invert
- every `repository.ts` method needs a tenant reference, and a branded type rather than a
  bare string
- `delivery.ts` calls `resolveSecret(ref)` with no tenant and hardcodes both Discord
  mechanisms

Mechanical work, not intellectual. Reshape each piece as the spec that needs it lands.

### Tier 3 — never opened (~800 lines)

`src/config.ts` · `src/main.ts` · `src/server.ts` · `src/bot/client.ts` ·
`src/bot/deploy-commands.ts` · the `src/web/` hello-world stub

This _is_ the "tenant identity == the OS process" layer. It does not get ported; it gets
replaced by the law.

### No predecessor at all — the real greenfield

The pivot produced documents, not code, and 007 was never built. So there is nothing to
consult for: the law module (tenant authority, derived-unforgeable references), the
tenant-scoped secret store, identity/OAuth/install, the core↔binding split itself,
rate-limit _fairness_ across tenants, and the spell model. This is the majority of the
interesting work.

## Deferred, but destined — not abandoned

**Grimoire is the predecessor done right, and its features are on the way here.** What we
are pivoting away from is a set of _patterns_, not a set of features. Keep the two apart:
refusing a pattern is permanent, deferring a feature is only sequencing.

**Moderation is ~36% of the predecessor and is not on the cutover path** —
`src/bot/commands/` (1,233) + `sanctions.ts`/`channel.ts` (323). The predecessor's own
review called this surface scaffolding ("does this beat right-clicking?") and deferred its
payoff, infractions, twice.

But it is not discarded, and it already has its place in this model: **these are the
hexes.** Ban, kick, timeout, purge, lock, slowmode are the irreversible, high-blast-radius
verbs the vocabulary names as engineer-authored — never composable, cast by a human with
standing. They arrive when the hex half of the vocabulary is built. Nothing here is
"never"; it is simply not what makes the cutover possible.

The same holds for the whole shipped surface. Roles and nicknames are charms, moderation
verbs are hexes, the inbound sources are trigger species, faces are nouns. **The parity bar
is 001–006 as they _would have looked_ after the tenancy line landed** — which is
materially less work than 001–006 as they exist.

## What is actually refused — the patterns we are pivoting from

These do not come across in any form, at any point. Rebuilding them would re-implement work
the predecessor's own roadmap was going to delete:

| Condemned                | Where it lives               | Why                                            |
| ------------------------ | ---------------------------- | ---------------------------------------------- |
| `DISCORD_DEV_GUILD_ID`   | `src/config.ts:48`           | Command registration becomes a runtime service |
| `TEXT_PREFIX`            | `src/config.ts:61`           | Needs `MessageContent`, a privileged intent    |
| `DEMO_CHANNEL_WEBHOOK`   | config + delivery            | Replaced by per-tenant mint/list/adopt faces   |
| deploy-time registration | `src/bot/deploy-commands.ts` | Tier 3; replaced by per-guild runtime service  |

And the pattern beneath all of them, which is the whole reason for the reset: **tenant
identity living in the process** — one token, one env, one client, one owner. Every Tier 3
file is a symptom of it.

The rule generalizes: **rebuild shipped behavior in its intended final form, not as
shipped.** Extract the work until it is capitalized on; refuse the patterns it was built
with.

## The trajectory difference

Grimoire re-walks the predecessor's spec series, but toward an end the predecessor was
never pointed at. Its specs were **Discord-specific by construction** — a Discord hub that
later discovered it wanted tenants. Grimoire is a platform for performative speech in which
**Discord is the first binding**, and every spec is aimed there from the first row written.

So the series is not invented from nothing, and it is not copied either: each of 001–006 is
re-cut against the model, and the pieces land in different places than they did.

| Predecessor           | Lands in Grimoire as                                             |
| --------------------- | ---------------------------------------------------------------- |
| inbound webhooks      | a **trigger species** (external call), mounted by the binding    |
| routes + transforms   | **spells** — stored sentences — plus **logic forms**             |
| delivery service      | **logistics**: media, guarantees, the one chokepoint             |
| roles, nicknames      | **charms** in the verb vocabulary                                |
| moderation, sanctions | **hexes** — engineer-authored, never composable                  |
| the whitelist, faces  | **nouns** the tenant owns                                        |
| _(never existed)_     | the **law** — authentication, tenant authority, member authority |

That last row is the trajectory difference in one line: the predecessor had no law because
it had exactly one owner, and everything it built assumed that. Here the law is present from
001, so every later spec is written against it rather than retrofitted onto it.

## Cutover

Cut over **early on a thin spine, not late at full 006 parity** — parity is a target that
expands while you are not shipping. Both repos are never maintained at once; the old one
freezes the moment the new one starts.

**Freezing is not deleting, and there is no hurry to delete.** The predecessor can sit
frozen and serving for as long as it is useful; archiving it is a housekeeping act with no
deadline attached, and no work here is gated on it.

1. **Transplant the infrastructure** — stage, not play. Outside the model; re-deriving it is
   waste. _(Done: toolchain, lint, typecheck, vitest, `.nvmrc`, `check:all`, and the release
   flow — which is **not** transplanted but consumed as
   `snackbyte-release-flow-action@v1`, the extracted form of the predecessor's
   `derive-version.sh`. Do not copy that script back in; that would regress to its
   pre-extraction ancestor.)_

   **The rest of this step lands inside 001, not before it.** `Dockerfile`,
   `cloudbuild.yaml`, the deploy job, `migrate`, `build`, `dev`, and `load-env` all need a
   server entrypoint and a database to be meaningful — and a config that cannot be run is a
   trap, not a head start. "It builds, deploys, and serves" is a spec outcome; it belongs
   where it can be tested.

2. **Fresh Supabase project** — grants the separate-prod-DB wish, and is the natural moment
   to rotate the credentials that passed through setup sessions.
3. **Spec 001's spine green on a _new_ Cloud Run service** — never the predecessor's.
   _(Done, 2026-07-22.)_ `grimoire-staging` on Cloud Run us-central1, against a
   `grimoire-staging` Supabase project, speaking as the `grimoire-dev` Discord application.
   The `.dev` domain is the dev tier and `.io` production, so the naming runs
   `grimoire-staging` everywhere rather than the bare production name.

   **The predecessor's staging tier is fully unwound**: its Supabase project, its Cloud Run
   service, and its `discord.snackbyte.dev` record are all gone. Its production tier —
   `snackbyte-discord` and the `discord` Supabase project — is untouched and still
   load-bearing, which is the whole point of taking staging first.
   Sharing a service would couple the two deployments and make steps 4 and 5 impossible:
   moving one webhook at a time, and rolling back, both require the old service to keep
   serving untouched while the new one takes traffic.

   **The deploy path itself was the last thing to become real.** Staging was hand-deployed
   three times with `gcloud run deploy --source` before anyone ran CI, so `cloudbuild.yaml`
   described a deployment nobody had performed — and described it wrongly: it defaulted the
   service to the bare production name and hardcoded secrets whose names read as production
   but held staging values. A CI deploy would have created production wired to staging's
   database, silently. Every environment-varying value is now a required substitution with
   no default, the branch→environment mapping lives in `release.yml`, and an unmapped branch
   is a hard failure. _(Proven 2026-07-22: `v0.2.0-dev` built and deployed
   `grimoire-staging-00004` through CI, then a push to `dev` deployed `v0.2.1-dev`
   unattended.)_ The lesson generalises: a config that has never executed is not
   infrastructure, it is a guess.

4. **Cut inbound over per source** — a webhook is a URL, so ClickUp moves, gets watched, then
   GitHub. Each is independently reversible. _(Done, 2026-07-22.)_ Both moved: ClickUp by
   repointing the existing workspace webhook (its secret is minted by ClickUp and survives an
   endpoint change, so a PUT preserves it where a POST would silently invalidate it), GitHub
   by creating a new hook on this repo and deleting the predecessor's. Both verified with
   real, source-signed traffic reaching `#grimoire`.

   Cutting ClickUp over is also what exposed a live defect in the rule language: `equals`,
   `oneOf`, and the pattern forms each treated an absent fact differently, so the obvious way
   to write "this fact has a value" matched precisely the events where it did not. Seventy
   unit tests missed it because none of them asked about a missing fact; one real webhook
   found it in under a minute. **That is the argument for cutting over on real traffic early
   rather than expanding the test suite in isolation.**

5. **Flip the gateway last.** This is the one irreversible moment: two processes on one bot
   token both answer every interaction, so **the gateway is atomic per application**. Rehearse
   against the `snackbyte-dev` application first.

**The fact that changes how aggressive this can be:** whether anything besides Jeff's own
guilds depends on the live bot. If nothing does, the old repo can simply be frozen and a gap
accepted — which removes the coexistence work entirely. If a friend's server is already on
it, keep the per-source sequence above.

## Spec 001

001 is the declared exception to the one-piece-one-part-of-the-grammar rule: it lands the
**invocation itself** — one complete walk of trigger → law → spell → logic → verbs → nouns →
logistics, with every station doing its minimum non-trivial work, tenant-first from the first
row written. The rule governs from 002 onward.

In tier terms: mostly Tier 2 reshaping plus the genuinely-new law, with Tier 1 verbs arriving
free.

**001 ends the migration. It does not end the catch-up** — it delivers 007's substance in
full but only a thin slice of the predecessor's shipped behavior. Everything after it is
ordinary feature work on a foundation that never has to move again.
