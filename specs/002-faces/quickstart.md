# Quickstart — 002 Faces

How to prove faces work end to end. Assumes 001's environment: a Postgres reachable via
`.env.local` (local) or `scripts/pull-env.sh <env>` (cloud), the migrations applied, and the
Discord bindings mounted. Faces additionally need the bot to hold **Manage Webhooks** in the
test guild (mint/list require it — FR-002/006).

See [data-model.md](./data-model.md) for the `faces` table and [contracts/faces.md](./contracts/faces.md)
for the operations. This guide runs them; it does not restate them.

## Prerequisites

- Migrations current, including `0002_faces.sql`: `node --env-file=.env.local scripts/migrate.mjs`
- A seeded tenant with an install + channel (as `seed-dev.mjs` / `seed-prod.mjs` produce).
- For a live channel: the bot invited with **View Channel + Send Messages + Manage Webhooks**.

## Scenario 1 — Mint a face and speak through it (US1 · FR-001/009/010)

```bash
# establish the channel's webhook + a "GitHub" face
DATABASE_URL=… TENANT_NAME="…" DISCORD_CHANNEL_ID=<channel> FACE_NAME="GitHub" \
  FACE_AVATAR_URL="https://…/github.png" \
  node scripts/provision-face.mjs mint
# → prints the new faceId (never the webhook URL)

# point a spell at the face (its verb_config uses faceId instead of destinationId),
# then drive a real event the spell answers.
```

**Expected**: one message in the channel under the name **GitHub** and the chosen avatar — not
the platform bot. The `records` row reads `delivered`, identical in shape to an
application-sent message (FR-011/012).

**Add a second persona in the same channel** (`FACE_NAME="ClickUp"` → mint): the channel still
has exactly **one** webhook; both faces speak through it (FR-010). Confirm with
`node scripts/provision-face.mjs list` — two faces, one channel, **no URL in the output**.

## Scenario 2 — Isolation: no tenant can reach another's face (US2 · FR-007/008)

With two tenants each owning a face:

```bash
node scripts/provision-face.mjs list   # as tenant A → only A's faces, never B's (FR-006)
```

- Point tenant A's spell at tenant B's `faceId` → the invocation is recorded **failed**, never
  delivered (FR-008).
- `delete` / `rename` tenant B's face while acting as A → refused, B's face unchanged (FR-007).

**Expected**: every crossing refused; A never learns B's faces exist.

## Scenario 3 — Revoke a face, and the record never lies (US3 · FR-015/016)

```bash
# a face a spell already delivered through:
DATABASE_URL=… TENANT_NAME="…" FACE_ID=<faceId> node scripts/provision-face.mjs delete
# → deletes the row; if it was the channel's last face, retires the webhook
```

Drive the same spell again.

**Expected**: no message appears; the `records` row reads **failed** (the retired webhook →
404 → permanent — FR-018), never `delivered`. Messages the face sent **before** deletion are
still in the channel, unchanged (FR-016).

## Scenario 4 — Adopt an existing persona (US4 · FR-003/004)

```bash
# explicit, non-default — ADOPT_WEBHOOK_URL must be set on purpose:
DATABASE_URL=… TENANT_NAME="…" DISCORD_CHANNEL_ID=<channel> FACE_NAME="miss honey" \
  ADOPT_WEBHOOK_URL="https://discord.com/api/webhooks/…" \
  node scripts/provision-face.mjs adopt
```

Point a spell at the adopted face and invoke.

**Expected**: messages arrive under the pre-existing "miss honey" name/avatar; members see no
change. Running `mint` never adopts, and `adopt` without `ADOPT_WEBHOOK_URL` refuses (FR-004).

## Automated gate (what CI runs)

- `npm run check:all` — format, lint, typecheck, unit tests (verb face-branch; binding webhook
  calls against a stub fetch; the credential-redaction test).
- `npm run test:e2e` — integration against real Postgres + a stub HTTP platform: Scenarios 1–3
  as assertions (mint→speak→`delivered`, cross-tenant→refused, delete→`failed`), plus "the
  webhook URL appears in no log line and no list output".

## The one manual slice

Confirming the message **visibly** wears the face's name and avatar in a real Discord channel
is the only step that needs a human eye — everything else (outcome, record, isolation,
redaction) is asserted automatically.
