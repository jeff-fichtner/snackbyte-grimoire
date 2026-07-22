/**
 * The verb vocabulary — the only way the world changes.
 *
 * Verbs are engineer-shipped and classed. `charm` is reversible and low blast radius and may
 * appear in a tenant-composed spell; `hex` is irreversible and may not, ever. The class is
 * carried from the first verb even though this feature ships only a charm, because
 * retrofitting a safety classification onto an unclassed vocabulary means auditing every
 * verb later — and missing one.
 *
 * A verb never sees a status code. Retry, backoff, and rate limits live in logistics, so
 * this layer stays about meaning.
 */
import type { CanonicalEvent } from '../event.js';

export type VerbClass = 'charm' | 'hex';

/** What a verb is handed: the event, and a way to speak. */
export interface VerbContext {
  event: CanonicalEvent;
  /** Send a message to a destination the tenant owns. Routed through the chokepoint. */
  speak(destinationId: string, content: string): Promise<void>;
}

export interface Verb<Config = unknown> {
  readonly key: string;
  readonly verbClass: VerbClass;
  /** True when the verb replies to an invoker, so it needs a species that owes one. */
  readonly needsReturnChannel: boolean;
  /** Validate stored config into the verb's own shape. Unknown shapes are refused. */
  parse(raw: unknown): Config;
  perform(ctx: VerbContext, config: Config): Promise<void>;
}

const verbs = new Map<string, Verb<never>>();

export function registerVerb<C>(verb: Verb<C>): void {
  if (verbs.has(verb.key)) throw new Error(`verb ${verb.key} is already registered`);
  verbs.set(verb.key, verb as unknown as Verb<never>);
}

export function getVerb(key: string): Verb<never> | undefined {
  return verbs.get(key);
}

export function allVerbs(): readonly Verb<never>[] {
  return [...verbs.values()];
}

/** Verbs a tenant may compose. The composer offers exactly this set and no more. */
export function composableVerbs(): readonly Verb<never>[] {
  return allVerbs().filter((v) => v.verbClass === 'charm');
}
