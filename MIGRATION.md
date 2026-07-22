# Migration — from `snackbyte-discord` to Grimoire

Grimoire supersedes `~/snackbyte/code/snackbyte-discord` (private): a working, deployed,
single-tenant Discord hub — 6 shipped specs, 4,331 lines of `src`, 2,737 lines across 29
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

### Tier 1 — lifts nearly verbatim, with its tests attached (~1,400 lines)

`src/bot/members/` (284) · `src/bot/moderation/` guards (418) · `src/routing/transforms/` ·
the adapters' parse/normalize logic in `src/sources/`

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

## What does not come across at all

**Moderation is ~30% of the predecessor and is not on the cutover path.**
`src/bot/commands/` (1,233) + `src/bot/moderation/` (418). Both parties in the predecessor's
own review called it scaffolding — "does this beat right-clicking?" — and its payoff
(infractions) was deferred twice. Leave it behind the cutover. Add it later, or never.

**Anything the predecessor's own roadmap already condemned.** Rebuilding these would be
re-implementing work 007–013 was going to delete:

| Condemned                | Where it lives               | Why                                            |
| ------------------------ | ---------------------------- | ---------------------------------------------- |
| `DISCORD_DEV_GUILD_ID`   | `src/config.ts:48`           | Command registration becomes a runtime service |
| `TEXT_PREFIX`            | `src/config.ts:61`           | Needs `MessageContent`, a privileged intent    |
| `DEMO_CHANNEL_WEBHOOK`   | config + delivery            | Replaced by per-tenant mint/list/adopt faces   |
| deploy-time registration | `src/bot/deploy-commands.ts` | Tier 3; replaced by per-guild runtime service  |

The rule generalizes: **rebuild shipped behavior in its intended final form, not as
shipped.** The parity bar is 001–006 as they _would have looked_ after the tenancy line
landed, which is materially less work than 001–006 as they exist.

## Cutover

Cut over **early on a thin spine, not late at full 006 parity** — parity is a target that
expands while you are not shipping. Both repos are never maintained at once; the old one
freezes the moment the new one starts.

1. **Transplant the infrastructure** — stage, not play. Outside the model; re-deriving it is
   waste. _(Partially done: toolchain, lint, typecheck, vitest, `.nvmrc`, `check:all` are in.
   Still to come from the predecessor: `Dockerfile`, `cloudbuild.yaml`,
   `.github/workflows/ci-cd.yml`, and `scripts/` — deploy, set-secrets, derive-version + its
   test, migrate, build, dev, load-env.)_
2. **Fresh Supabase project** — grants the separate-prod-DB wish, and is the natural moment
   to rotate the credentials that passed through setup sessions.
3. **Spec 001's spine green on a _new_ Cloud Run service** — never the predecessor's.
4. **Cut inbound over per source** — a webhook is a URL, so ClickUp moves, gets watched, then
   GitHub. Each is independently reversible.
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
