/**
 * A source adapter: one external system's payloads, turned into canonical events.
 *
 * Adapters are registered, never switched on. Adding a second source is one module plus one
 * registration — no change to matching, delivery, or recording.
 */
import type { CanonicalEvent } from '../core/language/event.js';

/**
 * What an adapter is handed to enrich an event: a tenant-scoped secret resolver and a fetch.
 *
 * `resolveSecret` is already bound to the verified tenant of THIS call, so a source can only
 * ever read its own tenant's credential — enrichment inherits the same isolation as everything
 * else (Constitution VIII). `fetch` is injected so enrichment is testable without a network.
 */
export interface EnrichContext {
  resolveSecret(ref: string): Promise<string | null>;
  fetch: typeof fetch;
}

export interface SourceAdapter {
  readonly key: string;
  /** The header carrying the signature, so the law knows where to look without knowing why. */
  readonly signatureHeader: string;
  /** Compute the expected signature for a body and secret, in this source's own scheme. */
  sign(body: Buffer, secret: string): string;
  /**
   * Parse verified bytes into a canonical event, or null when this payload is not something
   * a spell can be written against (a ping, a shape we do not model).
   */
  parse(body: Buffer, headers: Readonly<Record<string, string | undefined>>): CanonicalEvent | null;
  /**
   * Optionally add facts that the webhook itself does not carry, by asking the source's own
   * API with a tenant credential (e.g. ClickUp sends a task id but not its name). Best-effort
   * by contract: it returns a possibly-enriched event and must never throw or block delivery —
   * a missing credential or a failed lookup returns the event unchanged, losing a fact but
   * never inventing one. A source that needs nothing extra simply omits it.
   */
  enrich?(event: CanonicalEvent, ctx: EnrichContext): Promise<CanonicalEvent>;
}

const adapters = new Map<string, SourceAdapter>();

export function registerSource(adapter: SourceAdapter): void {
  if (adapters.has(adapter.key)) throw new Error(`source ${adapter.key} is already registered`);
  adapters.set(adapter.key, adapter);
}

export function getSource(key: string): SourceAdapter | undefined {
  return adapters.get(key);
}
