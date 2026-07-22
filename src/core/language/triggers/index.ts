/**
 * Trigger species — the ways a spell can begin.
 *
 * A registry rather than a switch: adding a species is writing one module and registering
 * it, never editing the code that matches spells or delivers messages.
 *
 * `opensReturnChannel` is the two-way asymmetry made machine-readable. Some species owe
 * their invoker a reply and are the only place a private one is possible; others speak
 * outward or stay silent. The flag exists before there is a composer because the agreement
 * rule it feeds — no reply verb under a species that opens no channel — has to be
 * enforceable the moment a second species appears.
 */

export interface TriggerSpecies {
  readonly key: string;
  readonly opensReturnChannel: boolean;
  /** One line, in the tenant's language, for surfaces that explain themselves. */
  readonly describe: string;
}

const species = new Map<string, TriggerSpecies>();

export function registerSpecies(s: TriggerSpecies): void {
  if (species.has(s.key)) throw new Error(`trigger species ${s.key} is already registered`);
  species.set(s.key, s);
}

export function getSpecies(key: string): TriggerSpecies | undefined {
  return species.get(key);
}

export function allSpecies(): readonly TriggerSpecies[] {
  return [...species.values()];
}

/**
 * An inbound call from outside. It can be answered outward, but nobody is waiting on the
 * other end — so no reply verb may be used under it, and a private reply is impossible.
 */
export const EXTERNAL_CALL: TriggerSpecies = {
  key: 'external_call',
  opensReturnChannel: false,
  describe: 'a webhook from the outside world',
};

registerSpecies(EXTERNAL_CALL);
