/**
 * A source adapter: one external system's payloads, turned into canonical events.
 *
 * Adapters are registered, never switched on. Adding a second source is one module plus one
 * registration — no change to matching, delivery, or recording.
 */
import type { CanonicalEvent } from '../core/language/event.js';

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
}

const adapters = new Map<string, SourceAdapter>();

export function registerSource(adapter: SourceAdapter): void {
  if (adapters.has(adapter.key)) throw new Error(`source ${adapter.key} is already registered`);
  adapters.set(adapter.key, adapter);
}

export function getSource(key: string): SourceAdapter | undefined {
  return adapters.get(key);
}
