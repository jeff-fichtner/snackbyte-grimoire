/**
 * What became of one invocation.
 *
 * The vocabulary is closed at six and adding a seventh is a schema change plus a deliberate
 * edit here — because the surface renders exactly these, and an invented outcome should fail
 * to compile rather than render as a mystery.
 */
export const OUTCOMES = [
  /** Recorded before the attempt. A record left here by a crash is TRUTHFUL: it says an
   *  attempt began and its end is unknown. It is also the seam a durable outbox grows from. */
  'pending',
  /** The destination accepted it. Written only after that is true. */
  'delivered',
  /** This event already acted for this spell; nothing was sent. */
  'deduped',
  /** A condition said no. Distinct from a failure — a declined event is the system working. */
  'declined',
  /** The law turned it away; no spell was reached, so the record carries no spell. */
  'refused',
  /** Retries were exhausted, or the failure was permanent. */
  'failed',
] as const;

export type Outcome = (typeof OUTCOMES)[number];

/** Outcomes that end an invocation. `pending` is the only one that does not. */
export type TerminalOutcome = Exclude<Outcome, 'pending'>;

export function isOutcome(value: string): value is Outcome {
  return (OUTCOMES as readonly string[]).includes(value);
}
