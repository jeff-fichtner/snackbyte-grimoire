import type { ReactNode } from 'react';
import type { NounCount } from '../view-model';
import styles from './Shell.module.css';

/**
 * The app frame: mark, tenant switcher, search, and the nav rail.
 *
 * The nav's second group — Grammar and Guarantees — is deliberately secondary. The
 * platform's vocabulary is reference a tenant may consult, never furniture they must
 * navigate around; promoting it to primary nav is the failure this layout exists to avoid.
 */
export function Shell({
  tenantName,
  nouns,
  active,
  children,
}: {
  tenantName: string;
  nouns: NounCount[];
  active: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.mark}>
          <span className={styles.sigil} aria-hidden="true">
            ◆
          </span>
          <span className={styles.wordmark}>Grimoire</span>
        </div>
        <div className={styles.divider} aria-hidden="true" />
        <button type="button" className={styles.tenant}>
          <span className={styles.crest} aria-hidden="true" />
          <span className={styles.tenantName}>{tenantName}</span>
          <span className={styles.caret} aria-hidden="true">
            ▾
          </span>
        </button>
        <div className={styles.topbarEnd}>
          <div className={styles.search}>
            <span aria-hidden="true">⌕</span>
            <span>Search the book…</span>
          </div>
          <div className={styles.avatar} aria-hidden="true" />
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label="Sections">
          {nouns.map((noun) => (
            <a
              key={noun.label}
              href={`#${noun.label.toLowerCase()}`}
              className={
                noun.label === active ? `${styles.navItem} ${styles.navActive}` : styles.navItem
              }
              aria-current={noun.label === active ? 'page' : undefined}
            >
              <span className={styles.navIcon} aria-hidden="true">
                {noun.icon}
              </span>
              <span className={styles.navLabel}>{noun.label}</span>
              {noun.count !== undefined && <span className={styles.navCount}>{noun.count}</span>}
            </a>
          ))}

          <div className={styles.navGroup}>
            <a href="#grammar" className={styles.navSecondary}>
              Grammar
            </a>
            <a href="#guarantees" className={styles.navSecondary}>
              Guarantees
            </a>
          </div>

          <div className={styles.binding}>
            <span className={styles.bindingDot} aria-hidden="true" />
            <span>discord · connected</span>
          </div>
        </nav>

        {children}
      </div>
    </div>
  );
}
