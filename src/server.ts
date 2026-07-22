/**
 * The HTTP surface.
 *
 * Two health routes in this phase. The inbound `/invoke/:registrationId` route arrives with
 * User Story 1 and mounts `express.raw()` on itself only, so verification happens over the
 * exact received bytes before anything is parsed.
 */
import express, { type Express } from 'express';
import type { Repository } from './db/repository.js';

export interface ServerDeps {
  repo: Repository;
}

export function createServer({ repo }: ServerDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  /**
   * Is the process running? Answers whenever the event loop turns, and MUST NOT consult the
   * database or any binding. A liveness probe that fails when Postgres blips gets the
   * container killed during someone else's outage — turning a dependency's problem into an
   * outage of our own.
   */
  app.get('/health/live', (_req, res) => {
    res.status(200).json({ live: true });
  });

  /**
   * Should this instance receive traffic? May reflect downstream state, unlike liveness.
   * The reason names a subsystem and never a credential or a tenant.
   */
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
