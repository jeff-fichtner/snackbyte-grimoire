import { useState } from 'react';
import { SpellPageView } from '../components/SpellPageView';
import { SpellRow } from '../components/SpellRow';
import type { Spell, SpellPage, Tenant } from '../view-model';
import styles from './Home.module.css';

/**
 * The book: every spell this community owns, one per line, with the open one shown as a
 * page beside it. A reading surface with a single creative act — not a control panel.
 */
export function Home({
  tenant,
  spells,
  pages,
}: {
  tenant: Tenant;
  spells: Spell[];
  pages: Record<string, SpellPage>;
}) {
  const [selectedId, setSelectedId] = useState<string>(
    spells.find((spell) => pages[spell.id])?.id ?? '',
  );

  const selected = spells.find((spell) => spell.id === selectedId);
  const page = selected ? pages[selected.id] : undefined;

  return (
    <>
      <main className={`${styles.main} scroll`}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Your grimoire</h1>
          <span className={styles.count}>
            {tenant.spellCount} spells · {tenant.castingToday} casting today
          </span>
          <button type="button" className={styles.newSpell}>
            + New spell
          </button>
        </div>
        <p className={styles.subtitle}>Stored sentences that do things when spoken.</p>

        <div className={styles.list}>
          {spells.map((spell) => (
            <SpellRow
              key={spell.id}
              spell={spell}
              selected={spell.id === selectedId}
              onSelect={setSelectedId}
            />
          ))}
          <div className={styles.listEnd} />
        </div>

        <p className={styles.promise}>
          every charm is deduped, retried, and recorded — the book never reports done what did not
          happen.
        </p>
      </main>

      {selected && page && <SpellPageView spell={selected} page={page} />}
    </>
  );
}
