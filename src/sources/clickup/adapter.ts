/**
 * ClickUp as a source.
 *
 * The second adapter, and therefore the proof of the claim `sources/types.ts` makes: adding a
 * source is one module plus one registration. Nothing in matching, delivery, or recording
 * changes to accommodate it — if anything below had to reach into core, the claim was false.
 *
 * Signature scheme is ClickUp's own: a bare HMAC-SHA256 hex digest of the exact request bytes
 * in `X-Signature`, with no algorithm prefix (unlike GitHub's `sha256=` form). As with every
 * adapter, it signs the received bytes — re-serializing parsed JSON does not round-trip.
 */
import { createHmac } from 'node:crypto';
import type { CanonicalEvent } from '../../core/language/event.js';
import { type EnrichContext, type SourceAdapter, registerSource } from '../types.js';

/**
 * A tenant's ClickUp API token, stored in the secret store by this ref. It is a DISTINCT
 * credential from the webhook signing secret (which only proves a payload is genuine) — this
 * one reads task detail back out of ClickUp, so it is held separately and resolved per tenant.
 * Absent ⇒ enrichment is simply off for that tenant; the relay still fires without the name.
 */
const CLICKUP_API_TOKEN_REF = 'clickup.api-token';
/** Bounded so a slow ClickUp API can never stall the inbound acknowledgement. */
const ENRICH_TIMEOUT_MS = 2500;

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** One authenticated GET against the ClickUp API, bounded, swallowing every failure to undefined. */
async function clickupGet(
  fetchImpl: typeof fetch,
  url: string,
  token: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const res = await fetchImpl(url, {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** The task, reduced to the facts a message can name. `folder`/`list` ride in the same response;
 *  `spaceId`/`teamId` are ids the space/workspace names must be looked up from separately. */
async function fetchTask(
  fetchImpl: typeof fetch,
  taskId: string,
  token: string,
): Promise<
  { name?: string; folder?: string; list?: string; spaceId?: string; teamId?: string } | undefined
> {
  const t = await clickupGet(fetchImpl, `https://api.clickup.com/api/v2/task/${taskId}`, token);
  if (!t) return undefined;
  const folder = t.folder as { name?: unknown; hidden?: unknown } | undefined;
  const list = t.list as { name?: unknown } | undefined;
  const space = t.space as { id?: unknown } | undefined;
  return {
    name: str(t.name),
    // A "hidden" folder is ClickUp's placeholder for a folderless list — not a real location.
    folder: folder && folder.hidden !== true ? str(folder.name) : undefined,
    list: str(list?.name),
    spaceId: str(space?.id),
    teamId: t.team_id != null ? String(t.team_id) : undefined,
  };
}

/** The space's name — the task carries only its id. */
async function fetchSpaceName(
  fetchImpl: typeof fetch,
  spaceId: string,
  token: string,
): Promise<string | undefined> {
  const s = await clickupGet(fetchImpl, `https://api.clickup.com/api/v2/space/${spaceId}`, token);
  return str(s?.name);
}

/** The workspace (team) name, matched from the token's team list — the task carries only team_id. */
async function fetchWorkspaceName(
  fetchImpl: typeof fetch,
  teamId: string,
  token: string,
): Promise<string | undefined> {
  const j = await clickupGet(fetchImpl, 'https://api.clickup.com/api/v2/team', token);
  const teams = Array.isArray(j?.teams) ? (j.teams as Array<Record<string, unknown>>) : [];
  return str(teams.find((x) => String(x.id) === teamId)?.name);
}

function obj(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export const clickup: SourceAdapter = {
  key: 'clickup',
  signatureHeader: 'x-signature',

  sign(body: Buffer, secret: string): string {
    return createHmac('sha256', secret).update(body).digest('hex');
  },

  parse(body): CanonicalEvent | null {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }

    // ClickUp names the happening in the body, not a header — the one structural difference
    // from GitHub, and the reason `parse` takes headers it does not always use.
    const eventType = str(payload.event);
    if (!eventType) return null;

    const history = Array.isArray(payload.history_items) ? payload.history_items : [];
    const item = obj(history[0]);

    // The history record id is ClickUp's identity for THIS change. A redelivery of the same
    // change carries the same id, which is what makes exactly-once reachable.
    //
    // When there is no history item we REFUSE rather than invent a key. A synthesized id
    // (a uuid, a hash of the body, a timestamp) would make every redelivery look like a new
    // happening and silently convert exactly-once into at-least-once — the guarantee would
    // still be claimed and no longer held. An unmodelled shape is an honest 202/matched:0.
    const dedupeKey = str(item?.id);
    if (!dedupeKey) return null;

    const before = obj(item?.before);
    const after = obj(item?.after);
    const user = obj(item?.user);
    const taskId = str(payload.task_id);

    const facts: Record<string, string> = {};
    const put = (key: string, value: string | undefined): void => {
      if (value !== undefined) facts[key] = value;
    };

    put('task_id', taskId);
    put('field', str(item?.field));
    put('status', str(after?.status));
    put('status_before', str(before?.status));
    put('user', str(user?.username));
    // Derived, not extracted: ClickUp does not send the human URL, but it is a pure function
    // of the task id. Knowing this belongs to the adapter — core must never learn it.
    if (taskId) put('url', `https://app.clickup.com/t/${taskId}`);

    return { source: 'clickup', eventType, dedupeKey, facts };
  },

  /**
   * Add facts the webhook never carries — it sends only `task_id`. Reads the tenant's ClickUp
   * token and asks the API for the task's name and where it lives: `{task_name}`, plus the
   * location breadcrumb `{workspace}` › `{space}` › `{folder}` › `{list}` (also offered
   * pre-joined as `{location}`, gap-free so a missing level never shows). Folder and list ride
   * in the task response; workspace and space names need a lookup each, done in parallel.
   *
   * Best-effort by the adapter contract: no token, an unknown task id, or a failed/slow call
   * returns the event with whatever was gathered (possibly nothing), so the relay still fires.
   * It only ever ADDS facts; it never removes or fabricates one.
   */
  async enrich(event: CanonicalEvent, ctx: EnrichContext): Promise<CanonicalEvent> {
    const taskId = event.facts.task_id;
    if (!taskId) return event;
    const token = await ctx.resolveSecret(CLICKUP_API_TOKEN_REF);
    if (!token) return event;
    const task = await fetchTask(ctx.fetch, taskId, token);
    if (!task) return event;

    // The two name lookups are independent — resolve them together, not one after the other.
    const [space, workspace] = await Promise.all([
      task.spaceId ? fetchSpaceName(ctx.fetch, task.spaceId, token) : undefined,
      task.teamId ? fetchWorkspaceName(ctx.fetch, task.teamId, token) : undefined,
    ]);

    const facts = { ...event.facts };
    const put = (key: string, value: string | undefined): void => {
      if (value) facts[key] = value;
    };
    put('task_name', task.name);
    put('workspace', workspace);
    put('space', space);
    put('folder', task.folder);
    put('list', task.list);
    // Pre-joined breadcrumb — only the levels that resolved, so no empty « › › » gaps appear.
    put('location', [workspace, space, task.folder, task.list].filter(Boolean).join(' › '));
    return { ...event, facts };
  },
};

registerSource(clickup);
