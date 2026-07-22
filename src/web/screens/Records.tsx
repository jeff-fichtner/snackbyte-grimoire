import { useState } from 'react';
import { StatusSeal } from '../components/StatusSeal';
import { TracePane } from '../components/TracePane';
import type { Outcome, Record_, Trace } from '../view-model';
import styles from './Records.module.css';

type Filter = 'all' | 'delivered' | 'refused' | 'failed';

const MATCHES: Record<Filter, (outcome: Outcome) => boolean> = {
  all: () => true,
  delivered: (outcome) => outcome === 'delivered' || outcome === 'deduped',
  refused: (outcome) => outcome === 'refused',
  failed: (outcome) => outcome === 'gave-up' || outcome === 'retrying',
};

/**
 * The ledger: every invocation and what became of it.
 *
 * This screen is the evidence behind the product's loudest promise — the book never
 * reports done what did not happen. A delivery that failed appears here as plainly as one
 * that succeeded, which is the whole point; a ledger that only showed successes would be
 * marketing, not a record.
 */
export function Records({
  records,
  traces,
}: {
  records: Record_[];
  traces: Record<string, Trace>;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [openTraceId, setOpenTraceId] = useState<string | undefined>(
    records.find((record) => record.traceId)?.traceId,
  );

  const shown = records.filter((record) => MATCHES[filter](record.outcome));
  const trace = openTraceId ? traces[openTraceId] : undefined;

  const counts = {
    all: records.length,
    refused: records.filter((record) => record.outcome === 'refused').length,
    failed: records.filter((record) => record.outcome === 'gave-up').length,
  };

  return (
    <>
      <main className={`${styles.main} scroll`}>
        <h1 className={styles.title}>Records</h1>
        <p className={styles.subtitle}>every invocation, and what became of it</p>
        <p className={styles.promise}>
          The book never reports done what did not happen. This is the proof.
        </p>

        <div className={styles.filters} role="tablist" aria-label="Filter records">
          {(
            [
              ['all', `all · ${counts.all.toLocaleString()}`],
              ['delivered', 'delivered'],
              ['refused', `refused · ${counts.refused}`],
              ['failed', `failed · ${counts.failed}`],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? `${styles.filter} ${styles.filterOn}` : styles.filter}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <table className={styles.ledger}>
          <thead>
            <tr>
              <th scope="col">time</th>
              <th scope="col">invocation</th>
              <th scope="col">outcome</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((record) => {
              const openable = Boolean(record.traceId);
              return (
                <tr
                  key={record.id}
                  className={[
                    openable ? styles.openable : '',
                    record.traceId && record.traceId === openTraceId ? styles.open : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => openable && setOpenTraceId(record.traceId)}
                >
                  <td className={styles.time}>{record.time}</td>
                  <td className={styles.invocation}>
                    <span className={styles.spellName}>
                      {record.spellName ?? <em className={styles.noSpell}>no spell reached</em>}
                    </span>
                    <span className={styles.detail}>{record.detail}</span>
                    {record.outcome === 'refused' && (
                      <span className={styles.turnedAway}>turned away at the door</span>
                    )}
                  </td>
                  <td className={styles.outcome}>
                    <StatusSeal outcome={record.outcome} qualifier={record.qualifier} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </main>

      {trace && <TracePane trace={trace} />}
    </>
  );
}
