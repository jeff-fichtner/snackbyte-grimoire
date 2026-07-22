/**
 * The canonical event — what a trigger produces, in terms core understands.
 *
 * A source adapter's whole job is to turn one platform's payload into this. Nothing
 * downstream knows which source it came from beyond the `source` key, which is why adding a
 * second source touches no matching, no delivery, and no recording.
 */

export interface CanonicalEvent {
  /** Which adapter produced it, e.g. `github`. */
  source: string;
  /** Exact-match key a spell selects on, e.g. `release`. */
  eventType: string;
  /**
   * Stable identity of this happening, from the source's own event id where one exists.
   * Two deliveries of the same happening MUST produce the same key — it is what makes
   * exactly-once possible at all.
   */
  dedupeKey: string;
  /** Flat, typed facts a predicate may test and a transform may name. */
  facts: Readonly<Record<string, string>>;
}
