import type { Trace } from '../view-model';
import styles from './TracePane.module.css';

const REFUSAL_GLOSS: Record<NonNullable<Trace['refusalKind']>, string> = {
  ungrammatical: 'caught while writing',
  unspeakable: 'refused at the law',
  undeliverable: 'caught while performing',
};

/**
 * One invocation, walked.
 *
 * This is the invocation spine made live: the same trigger → law → spell → logic → verb →
 * nouns → logistics walk the whole system is built on, showing the station where this
 * particular call stopped. Everything after a refusal reads "not reached", because that is
 * the truth — the walk does not continue past the station that turned it away.
 *
 * The opacity of a refusal note is deliberate and must not be "improved": where the law
 * declines to say whether a caller was unknown or forged, the surface may not say either.
 */
export function TracePane({ trace }: { trace: Trace }) {
  return (
    <aside className={`${styles.pane} scroll`} aria-label={`Trace ${trace.time}`}>
      <div className={styles.eyebrow}>The trace · {trace.time}</div>
      <h2 className={styles.title}>{trace.title}</h2>
      <p className={styles.summary}>{trace.summary}</p>

      <ol className={styles.walk}>
        {trace.stations.map((station) => (
          <li key={station.name} className={`${styles.station} ${styles[station.state]}`}>
            <span className={`${styles.pip} ${styles[station.branch]}`} aria-hidden="true" />
            <div className={styles.stationBody}>
              <div className={styles.stationName}>
                {station.name}
                {station.state === 'refused' && <span className={styles.refused}>refused</span>}
              </div>
              <div className={styles.stationDetail}>{station.detail}</div>
              {station.note && <p className={styles.note}>{station.note}</p>}
            </div>
          </li>
        ))}
      </ol>

      {trace.refusalKind && (
        <p className={styles.footer}>
          This is one of the three ways a spell is refused:{' '}
          <strong className={styles.kind}>{trace.refusalKind}</strong> —{' '}
          {REFUSAL_GLOSS[trace.refusalKind]}.
        </p>
      )}
    </aside>
  );
}
