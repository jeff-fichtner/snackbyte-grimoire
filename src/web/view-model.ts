/**
 * View types for the Grimoire surface.
 *
 * These describe what a screen RENDERS, not what the platform IS. The domain model —
 * spells, triggers, verbs, the law — is defined by the spec series and lives in core;
 * this file must never grow into a second copy of it. Nothing here decides whether a
 * spell is legal, only how an already-decided answer is shown.
 */

/** The class of every verb in a spell, and the product's whole safety line. */
export type SpellClass = 'charm' | 'hex';

export type SpellStatus = 'active' | 'paused' | 'sealed';

/**
 * A run of text inside a spell sentence. The sentence reads as language with syntax, so
 * its parts are coloured by what they MEAN, never by where they happen to sit.
 */
export type SentencePartKind =
  /** ordinary connective text */
  | 'plain'
  /** a language keyword — on, if, from */
  | 'keyword'
  /** a verb the spell performs */
  | 'verb'
  /** a noun the spell points at — a face, channel, role */
  | 'noun'
  /** part of an irreversible act */
  | 'danger';

export interface SentencePart {
  kind: SentencePartKind;
  text: string;
}

/** One line of a spell's page: an uppercase label over mono content. */
export interface SpellPageSection {
  label: string;
  body: SentencePart[];
  /** Optional plain-prose gloss under the body. */
  note?: string;
}

export interface Spell {
  id: string;
  name: string;
  /** Plain-English restatement of the trigger: "when a member joins". */
  when: string;
  /** The sentence's action half, as coloured parts. */
  does: SentencePart[];
  spellClass: SpellClass;
  status: SpellStatus;
  /**
   * Delivery promises the platform is making for this spell — shown in the list because
   * they are the difference between this and a webhook relay. Never overstate them.
   */
  guarantees: string[];
  castCount?: number;
  lastCast?: string;
  /** True when the spell is engineer-authored and cannot be edited or automated. */
  sealed?: boolean;
}

/** The expanded page for one spell, shown in the reading pane. */
export interface SpellPage {
  spellId: string;
  /** One sentence on what it is for, in the tenant's language. */
  summary: string;
  sections: SpellPageSection[];
  guarantees: string[];
  /** Shown instead of edit controls when the spell is sealed. */
  sealedNote?: string;
}

export interface NounCount {
  label: string;
  count?: number;
  icon: string;
}

export interface Tenant {
  name: string;
  spellCount: number;
  castingToday: number;
}
