import type { Spell, SpellPage } from '../view-model';
import { Sentence } from './Sentence';
import styles from './SpellPageView.module.css';

/**
 * A spell opened as a page.
 *
 * The surface carries the meaning: parchment means "the tenant's own artifact", so a hex
 * — engineer-authored, never theirs to assemble — does not get parchment. It opens as a
 * cold sealed slab instead. This is a rule, not a flourish; any future surface showing a
 * hex inherits it.
 *
 * The section labels are the invocation walk taught through one instance: When (trigger),
 * Who may (law), What happens (logic + verbs), Guarantees (logistics). The tenant learns
 * the grammar by reading sentences, never by studying its parts.
 */
export function SpellPageView({ spell, page }: { spell: Spell; page: SpellPage }) {
  const isHex = spell.spellClass === 'hex';

  return (
    <aside className={isHex ? styles.sealed : `${styles.page} on-page`} aria-label={spell.name}>
      <div className={isHex ? styles.eyebrowSealed : styles.eyebrow}>
        {isHex ? 'Hex · irreversible' : `Charm · ${spell.status}`}
      </div>
      <h2 className={styles.title}>{spell.name}</h2>
      <p className={styles.summary}>{page.summary}</p>

      {page.sections.map((section) => (
        <section key={section.label} className={styles.section}>
          <div className={styles.label}>{section.label}</div>
          <div className={styles.body}>
            <Sentence parts={section.body} />
          </div>
        </section>
      ))}

      {page.guarantees.length > 0 && (
        <section className={styles.section}>
          <div className={styles.label}>Guarantees</div>
          <ul className={styles.guarantees}>
            {page.guarantees.map((guarantee) => (
              <li key={guarantee}>
                <span aria-hidden="true">✓</span> {guarantee}
              </li>
            ))}
          </ul>
        </section>
      )}

      {page.sealedNote && <p className={styles.sealedNote}>{page.sealedNote}</p>}

      {isHex ? (
        <p className={styles.sealedFooter}>
          This spell is sealed — it cannot be edited or automated.
        </p>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.primary}>
            Edit spell
          </button>
          <button type="button" className={styles.secondary}>
            {spell.status === 'paused' ? 'Resume' : 'Pause'}
          </button>
        </div>
      )}
    </aside>
  );
}
