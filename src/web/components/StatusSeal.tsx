import type { Outcome } from '../view-model';
import styles from './StatusSeal.module.css';

/**
 * The closed vocabulary of outcomes.
 *
 * Colour carries the branch that decided: gold where the law turned it away, green where
 * logistics performed or correctly declined to repeat itself, rust where delivery
 * exhausted its retries. A surface that invents a sixth seal is claiming something the
 * platform never promised — so the type, not the caller, decides what may be shown.
 */
const WORDING: Record<Outcome, string> = {
  delivered: 'delivered',
  refused: 'refused',
  deduped: 'deduped',
  retrying: 'retrying',
  'gave-up': 'gave up',
};

export function StatusSeal({ outcome, qualifier }: { outcome: Outcome; qualifier?: string }) {
  return (
    <span className={`${styles.seal} ${styles[outcome]}`}>
      {WORDING[outcome]}
      {qualifier && <span className={styles.qualifier}>· {qualifier}</span>}
    </span>
  );
}
