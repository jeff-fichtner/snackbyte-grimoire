import type { Spell } from '../view-model';
import { Sentence } from './Sentence';
import styles from './SpellRow.module.css';

/**
 * One line of the book.
 *
 * The guarantee markers are not decoration: "deduped · recorded" is the difference
 * between a spell and a webhook relay, so it belongs in the list rather than hidden
 * behind a click. A hex shows a lock instead of a status dot — it is not the tenant's to
 * run or pause.
 */
export function SpellRow({
  spell,
  selected,
  onSelect,
}: {
  spell: Spell;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const isHex = spell.spellClass === 'hex';

  return (
    <button
      type="button"
      className={[styles.row, selected ? styles.selected : ''].filter(Boolean).join(' ')}
      onClick={() => onSelect(spell.id)}
      aria-pressed={selected}
    >
      <span className={styles.marker} aria-hidden="true">
        {isHex ? (
          <span className={styles.lock}>🔒</span>
        ) : (
          <span
            className={styles.dot}
            data-status={spell.status}
            style={{
              background: spell.status === 'paused' ? 'var(--gold-dim)' : 'var(--guarantee)',
            }}
          />
        )}
      </span>

      <span className={styles.identity}>
        <span className={styles.name}>{spell.name}</span>
        <span className={styles.when}>{spell.when}</span>
      </span>

      <span className={styles.does}>
        <Sentence parts={spell.does} />
      </span>

      <span className={styles.meta}>
        <span className={isHex ? styles.classHex : styles.classCharm}>
          {isHex ? 'hex' : spell.status === 'paused' ? 'paused' : 'charm'}
        </span>
        <span className={styles.guarantees}>
          {spell.guarantees.map((guarantee) => (
            <span key={guarantee} className={isHex ? styles.guaranteeSealed : styles.guarantee}>
              {guarantee}
            </span>
          ))}
        </span>
      </span>

      <span className={styles.cast}>
        {spell.castCount !== undefined ? `cast ${spell.castCount.toLocaleString()}×` : '—'}
        {spell.lastCast && <span className={styles.last}>{spell.lastCast}</span>}
      </span>
    </button>
  );
}
