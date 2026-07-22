# Parity — the predecessor's surface, as Grimoire objects

What `snackbyte-discord` does today, stated in this model, with what each piece needs before
it can exist here. This is the answer to "create the equivalent objects": most of them are
**not data to copy** — they are code, and in Grimoire they become entries in a vocabulary
that a later spec builds.

The distinction that matters: the predecessor's commands are TypeScript modules registered
at deploy time. Only their _runtime configuration_ ever reached its database — the
self-assignable-role whitelist, the reaction mappings, the component bindings — and all three
tables are **empty** in both environments. So there is very little to import and quite a lot
to re-express.

## Environments, established by inspection

|                | Database          | Discord application | Guild         |
| -------------- | ----------------- | ------------------- | ------------- |
| `.env` (dev)   | `discord-staging` | `1527429974…`       | `1527396812…` |
| `.env.staging` | **same as dev**   | same                | same          |
| `.env.prod`    | `discord`         | `1519079011…`       | `1412143249…` |

Dev and staging are one environment. Prod is separate, with its own application and guild —
which is why the cutover can take staging first and prod later without them interfering.

## The inbound half — mostly ready

| Predecessor                          | Grimoire object             | Status                                                               |
| ------------------------------------ | --------------------------- | -------------------------------------------------------------------- |
| `sources` rows (`clickup`, `github`) | `source_registrations`      | **carries across** — `scripts/import-predecessor.mjs`                |
| `routes` rows (2 in prod)            | `spells`                    | translated, but **blocked** — see below                              |
| `config.excludeSubtypes`             | a `not(oneOf(…))` condition | **carries across**, same meaning in the one rule language            |
| `discord_targets` (webhook mode)     | `destinations`              | **blocked** — a webhook URL is a face, and faces are a later feature |
| `delivery_log`                       | `records`                   | not imported; history stays with the predecessor                     |

**The one blocker is small and concrete.** Every route points at a single webhook-mode
target (`DEMO_CHANNEL_WEBHOOK`). Spell 001 posts _as the application_ over REST, so a
destination needs a channel id. Supply one channel id and both routes become real spells
immediately; otherwise they wait for faces.

## The bot half — all of it needs vocabulary that does not exist yet

Thirteen slash commands and 22 exported capability verbs. None of them can exist here today,
because every one needs a **trigger species** or a **verb class** that 001 did not build.
They are not lost; they are queued behind the specs that give them a grammar.

| Predecessor                                    | Grimoire object                             | Needs                                                        |
| ---------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `/ping`                                        | a spell: interaction → reply                | **interaction trigger species**                              |
| `/role`, `/roles`                              | **charms** — toggle/list a whitelisted role | interaction species + role verbs                             |
| `/nick` (self)                                 | **charm** — set own nickname                | interaction species + member verbs                           |
| `/nick` (other)                                | charm, gated by **standing**                | the above + member authority (Tier 1 lift)                   |
| `/ban`, `/unban`, `/bans`, `/kick`, `/timeout` | **hexes** — irreversible                    | hex half of the vocabulary + a human trigger                 |
| `/purge`, `/lock`, `/slowmode`, `/pin`         | **hexes** — high blast radius               | as above                                                     |
| reaction-roles                                 | a spell: ambient event → toggle role        | **ambient-event trigger species**                            |
| component (button) roles                       | a spell: interaction → toggle role          | interaction species + component style                        |
| text-prefix commands                           | —                                           | **not planned**: needs `MessageContent`, a privileged intent |
| `self_assignable_roles` whitelist              | a **noun** the tenant owns                  | role verbs; table is empty in both environments              |
| deploy-time command registration               | runtime registration service                | a later spec; the predecessor's approach is refused          |

### What that tells you about the spec series

Reading the "Needs" column, three things unlock nearly everything:

1. **The interaction trigger species** — unlocks 8 of the 13 commands on its own.
2. **The role and member verb families (charms)** — `/role`, `/roles`, `/nick`. These are the
   Tier 1 lift in `MIGRATION.md`: already pure, already tested, already tenant-safe.
3. **The hex half of the vocabulary** — the moderation surface, which both the predecessor's
   own review and this project agreed is the least differentiated part. Last, deliberately.

The ambient-event species (reaction-roles) and the runtime command registration service are
each a spec of their own.

## What to do with this

- **Now**: import the source registrations, and supply one channel id to unblock the two
  routes. That is genuine parity for the inbound half.
- **Next spec**: the interaction species plus the charm verbs — that is where the bot half
  starts existing here, and it is the largest single jump in visible parity.
- **Not yet**: hexes, and anything needing `MessageContent`.

Nothing above is a copy operation. The parity bar, as `MIGRATION.md` puts it, is 001–006 _as
they would have looked_ after the tenancy line landed — and this table is that list, ordered.
