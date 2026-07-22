/**
 * Guards the ledger and the trace.
 *
 * The load-bearing one here is opacity: where the law declines to say whether a caller was
 * unknown or forged, the surface may not say either. That is a security property borrowed
 * from the constitution, not a copy preference — a future "more helpful" error message
 * would leak exactly what an attacker is probing for, so it fails the gate instead.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusSeal } from '../../src/web/components/StatusSeal';
import { TracePane } from '../../src/web/components/TracePane';
import { records, traces } from '../../src/web/fixtures';
import { Records } from '../../src/web/screens/Records';
import type { Outcome } from '../../src/web/view-model';

describe('the ledger', () => {
  it('shows failures as plainly as successes — a success-only ledger is marketing', () => {
    render(<Records records={records} traces={traces} />);
    // "delivered" and "refused" appear on both a filter tab and a seal, hence getAllByText.
    expect(screen.getAllByText('delivered').length).toBeGreaterThan(0);
    expect(screen.getAllByText('refused').length).toBeGreaterThan(0);
    expect(screen.getByText('gave up')).toBeDefined();
  });

  it('says no spell was reached when the law refused before one could be', () => {
    render(<Records records={records} traces={traces} />);
    expect(screen.getByText('no spell reached')).toBeDefined();
    expect(screen.getByText('turned away at the door')).toBeDefined();
  });

  it('reports a held cast as held, never as delivered', () => {
    const heldRow = records.find((record) => record.outcome === 'gave-up');
    expect(heldRow?.qualifier).toBe('held');
  });
});

describe('the outcome vocabulary', () => {
  it('renders every outcome the platform can report, and only those', () => {
    const outcomes: Outcome[] = ['delivered', 'refused', 'deduped', 'retrying', 'gave-up'];
    for (const outcome of outcomes) {
      const { unmount } = render(<StatusSeal outcome={outcome} />);
      unmount();
    }
    expect(outcomes).toHaveLength(5);
  });
});

describe('the trace', () => {
  it('walks the invocation and marks everything past the refusal as not reached', () => {
    render(<TracePane trace={traces.t1} />);
    expect(screen.getByText('trigger')).toBeDefined();
    expect(screen.getByText('law admits')).toBeDefined();
    expect(screen.getAllByText('not reached').length).toBeGreaterThanOrEqual(2);
  });

  it('names which of the three refusals this was', () => {
    render(<TracePane trace={traces.t1} />);
    expect(screen.getByText('unspeakable')).toBeDefined();
  });

  it('never discloses whether the caller was unknown or forged', () => {
    render(<TracePane trace={traces.t1} />);
    const body = document.body.textContent ?? '';
    // The pane must say the caller failed, without saying WHICH way it failed.
    expect(body).toMatch(/unrecognized or unauthenticated/);
    expect(body).toMatch(/look identical/);
    // A future "helpful" message would name one and leak the distinction.
    expect(body).not.toMatch(/signature (did not|didn't) match/i);
    expect(body).not.toMatch(/no such (tenant|install|secret)/i);
  });
});
