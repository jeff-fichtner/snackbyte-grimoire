/**
 * The HTTP surface: one inbound door and two health routes.
 */
import express, { type Express } from 'express';
import { handleCommand, invoke } from './core/invocation.js';
import { authenticate } from './core/law/authenticate.js';
import { tenantFromVerifiedInteraction } from './core/law/tenant-ref.js';
import type { Binding } from './core/logistics/binding.js';
import type { InteractionAdapter } from './core/logistics/interaction.js';
import { childLog } from './core/log.js';
import type { Repository } from './db/repository.js';
import { getSource } from './sources/types.js';

const log = childLog('server');

export interface ServerDeps {
  repo: Repository;
  binding: Binding;
  applicationId: string;
  sleep?: (ms: number) => Promise<void>;
  /** Injected so source enrichment (e.g. a ClickUp task-name lookup) is testable offline. */
  fetchImpl?: typeof fetch;
  /** The binding's interaction surface. Absent ⇒ the interactions endpoint is not served. */
  interactions?: InteractionAdapter;
}

export function createServer({
  repo,
  binding,
  applicationId,
  sleep,
  fetchImpl = fetch,
  interactions,
}: ServerDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  /**
   * The one door an external source knocks on.
   *
   * `express.raw` is mounted on THIS ROUTE ONLY, so the body is the exact bytes the source
   * signed. Parsing first and re-serializing does not round-trip — key order, whitespace and
   * unicode escapes all shift — so a signature checked against re-serialized JSON silently
   * never matches. Nothing here parses until the law has admitted the call.
   */
  app.post(
    '/invoke/:registrationId',
    express.raw({ type: '*/*', limit: '1mb' }),
    async (req, res) => {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const headers = req.headers as Record<string, string | undefined>;

      const admission = await authenticate(repo, req.params.registrationId, body, headers);

      if (!admission.admitted) {
        if (admission.reason === 'unavailable') {
          // Invite a resend rather than let the source treat the event as consumed. A 500
          // tells some providers the event was received and malformed, and they stop.
          res.status(503).json({ error: 'unavailable' });
          return;
        }
        // ONE behaviour, not two. An unknown registration and a forged signature get the
        // same status, the same body, and the same work — see authenticate().
        res.status(401).json({ error: 'unauthorized' });
        return;
      }

      const adapter = getSource(admission.source);
      const parsed = adapter?.parse(body, headers) ?? null;
      if (!adapter || !parsed) {
        // Genuine, but nothing a spell can be written against (a ping, an unmodelled shape).
        res.status(202).json({ accepted: true, matched: 0 });
        return;
      }

      // Enrichment: let the source add facts its webhook did not carry (a ClickUp task's name),
      // using a secret resolver bound to THIS tenant. Best-effort by the adapter contract —
      // it returns the event unchanged rather than throwing — but guarded here too, so a
      // misbehaving adapter can never turn a deliverable event into a dropped one.
      let event = parsed;
      if (adapter.enrich) {
        try {
          event = await adapter.enrich(parsed, {
            resolveSecret: (ref) => repo.resolveSecret(admission.tenant, ref),
            fetch: fetchImpl,
          });
        } catch (error) {
          log.warn(
            { source: parsed.source, err: error instanceof Error ? error.message : String(error) },
            'enrichment failed; proceeding with the un-enriched event',
          );
        }
      }

      // Acknowledge once the work is claimed and under way, not once it is delivered:
      // waiting for a slow destination would exceed the source's budget and manufacture
      // duplicate inbound events.
      const outcome = await invoke(
        { repo, binding, applicationId, sleep },
        admission.tenant,
        event,
      );

      log.info({ source: event.source, type: event.eventType, ...outcome }, 'invocation');
      res.status(202).json({ accepted: true, ...outcome });
    },
  );

  /**
   * The interaction door — Discord POSTs a slash command here (the HTTP transport, not the
   * gateway), signed with Ed25519. The binding verifies and normalizes it to a canonical event;
   * the law resolves the guild to a tenant; the command walk runs and its reply is the
   * synchronous response. Served only when a binding supplied an interaction surface.
   */
  app.post('/interactions', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    if (!interactions) {
      res.status(503).json({ error: 'interactions not configured' });
      return;
    }
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const headers = req.headers as Record<string, string | undefined>;
    const signature = headers['x-signature-ed25519'];
    const timestamp = headers['x-signature-timestamp'];

    // Discord requires a 401 on a bad signature — and it probes the endpoint with a deliberately
    // invalid one when the URL is set, so this rejection has to be clean.
    if (!signature || !timestamp || !interactions.verify(timestamp, body, signature)) {
      res.status(401).json({ error: 'bad signature' });
      return;
    }

    const parsed = interactions.parse(body);
    if (parsed.kind === 'ping') {
      res.json(interactions.pong());
      return;
    }
    if (parsed.kind !== 'command') {
      res.json(interactions.ephemeral('This interaction is not handled.'));
      return;
    }

    try {
      const install = await repo.resolveInstallTenant(binding.key, parsed.command.guildRef);
      if (!install) {
        res.json(interactions.ephemeral('This server is not set up for that command.'));
        return;
      }
      const tenant = tenantFromVerifiedInteraction({
        guildRef: parsed.command.guildRef,
        tenantId: install.tenantId,
        signatureVerified: true,
      });
      const content = await handleCommand(repo, tenant, parsed.command.event);
      res.json(
        content ? interactions.message(content) : interactions.ephemeral('Nothing happened.'),
      );
    } catch (error) {
      log.warn(
        {
          cmd: parsed.command.event.eventType,
          err: error instanceof Error ? error.message : String(error),
        },
        'interaction failed',
      );
      res.json(interactions.ephemeral('Something went wrong casting that.'));
    }
  });

  /**
   * Is the process running? Answers whenever the event loop turns, and MUST NOT consult the
   * database or any binding — a liveness probe that fails when Postgres blips gets the
   * container killed during someone else's outage.
   */
  app.get('/health/live', (_req, res) => {
    res.status(200).json({ live: true });
  });

  /** Should this instance receive traffic? May reflect downstream state; liveness may not. */
  app.get('/health/ready', async (_req, res) => {
    let reachable = false;
    try {
      reachable = await repo.ping();
    } catch {
      reachable = false;
    }
    if (reachable) {
      res.status(200).json({ ready: true });
      return;
    }
    res.status(503).json({ ready: false, reason: 'store unreachable' });
  });

  return app;
}
