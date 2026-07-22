/**
 * The HTTP surface: one inbound door and two health routes.
 */
import express, { type Express } from 'express';
import { invoke } from './core/invocation.js';
import { authenticate } from './core/law/authenticate.js';
import type { Binding } from './core/logistics/binding.js';
import { childLog } from './core/log.js';
import type { Repository } from './db/repository.js';
import { getSource } from './sources/types.js';

const log = childLog('server');

export interface ServerDeps {
  repo: Repository;
  binding: Binding;
  applicationId: string;
  sleep?: (ms: number) => Promise<void>;
}

export function createServer({ repo, binding, applicationId, sleep }: ServerDeps): Express {
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
      const event = adapter?.parse(body, headers) ?? null;
      if (!event) {
        // Genuine, but nothing a spell can be written against (a ping, an unmodelled shape).
        res.status(202).json({ accepted: true, matched: 0 });
        return;
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
