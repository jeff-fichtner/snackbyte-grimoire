/**
 * The chokepoint. Every outbound message passes through here and there is no second path.
 *
 * It carries four guarantees that would otherwise be scattered and inconsistent:
 * dedupe (claimed before the attempt), bounded retry with the platform's own wait honoured,
 * per-tenant fairness, and an outcome recorded for every invocation. A verb never sees a
 * status code; that knowledge lives here.
 */
import { type TenantRef, tenantId } from '../law/tenant-ref.js';
import type { RecordInput, Repository } from '../../db/repository.js';
import { childLog } from '../log.js';
import {
  type Binding,
  type OutboundFace,
  PermanentDeliveryFailure,
  TransientDeliveryFailure,
} from './binding.js';

const log = childLog('deliver');

const MAX_ATTEMPTS = 4;
/**
 * How many deliveries one tenant may have in flight at once.
 *
 * The smallest mechanism that is *total*: it cannot starve anyone, needs no tuning against
 * traffic that does not exist yet, and has no queue to grow unboundedly. A weighted queue is
 * better under real contention and should wait for real contention to be designed against.
 */
const PER_TENANT_CONCURRENCY = 4;

const inFlight = new Map<string, number>();

async function withFairShare<T>(tenant: TenantRef, work: () => Promise<T>): Promise<T> {
  const key = tenantId(tenant);
  while ((inFlight.get(key) ?? 0) >= PER_TENANT_CONCURRENCY) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  inFlight.set(key, (inFlight.get(key) ?? 0) + 1);
  try {
    return await work();
  } finally {
    const remaining = (inFlight.get(key) ?? 1) - 1;
    if (remaining <= 0) inFlight.delete(key);
    else inFlight.set(key, remaining);
  }
}

function backoffMs(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) return retryAfterSeconds * 1000;
  return 2 ** attempt * 250;
}

export interface DeliverDeps {
  repo: Repository;
  binding: Binding;
  applicationId: string;
  /** Injected so tests do not wait out real backoff. */
  sleep?: (ms: number) => Promise<void>;
}

export type DeliveryResult = 'delivered' | 'deduped' | 'failed';

/**
 * Claim the event, then attempt it, then settle the record to the truth.
 *
 * Two writes, not one. A single write after delivery loses the fact of an attempt if the
 * process dies mid-flight; a single write before it would claim a success that has not
 * happened. `pending` in between is honest: it says an attempt began and its end is unknown.
 */
export async function deliver(
  deps: DeliverDeps,
  tenant: TenantRef,
  record: RecordInput,
  channelRef: string,
  content: string,
  /** When set, the message speaks through this face instead of as the application. */
  face?: OutboundFace,
): Promise<DeliveryResult> {
  const { repo, binding, applicationId } = deps;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  // Claimed BEFORE the attempt. The database serializes this, so two concurrent copies of
  // one event cannot both deliver — a check-then-act in application code has a race window
  // that opens exactly during a provider's retry storm.
  const claim = await repo.beginRecord(tenant, record);
  if (claim === 'duplicate') {
    // Nothing is sent — and the ledger says so, rather than staying silent about a resend.
    await repo.recordDeduped(tenant, record);
    return 'deduped';
  }

  return withFairShare(tenant, async () => {
    let lastError = 'delivery failed';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await binding.send(applicationId, { channelRef, content, face });
        await repo.settleRecord(tenant, claim, 'delivered');
        return 'delivered';
      } catch (error) {
        if (error instanceof PermanentDeliveryFailure) {
          // Retrying cannot change the answer. Stop immediately and say so.
          await repo.settleRecord(tenant, claim, 'failed', error.message);
          log.warn({ spell: record.spellId, err: error.message }, 'permanent delivery failure');
          return 'failed';
        }

        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < MAX_ATTEMPTS) {
          const wait =
            error instanceof TransientDeliveryFailure
              ? backoffMs(attempt, error.retryAfterSeconds)
              : backoffMs(attempt);
          await sleep(wait);
        }
      }
    }

    // Retries exhausted. Recorded as failed — never as delivered, because it was not.
    await repo.settleRecord(tenant, claim, 'failed', lastError);
    log.warn({ spell: record.spellId, err: lastError }, 'gave up after retries');
    return 'failed';
  });
}
