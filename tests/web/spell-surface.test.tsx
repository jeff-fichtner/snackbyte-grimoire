/**
 * Guards the rules the surface is required to render.
 *
 * These are presentation invariants, not business rules — the platform decides what is
 * legal, and the web surface only has to stop misrepresenting it. Each test here maps to
 * a promise made in GRIMOIRE.md, so a redesign that quietly drops one fails the gate
 * rather than shipping.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpellPageView } from '../../src/web/components/SpellPageView';
import { SpellRow } from '../../src/web/components/SpellRow';
import { spellPages, spells } from '../../src/web/fixtures';
import type { Spell } from '../../src/web/view-model';

const spellNamed = (id: string): Spell => {
  const spell = spells.find((candidate) => candidate.id === id);
  if (!spell) throw new Error(`no fixture spell '${id}'`);
  return spell;
};

describe('a spell in the list', () => {
  it('shows its guarantees, because that is the difference from a webhook relay', () => {
    render(<SpellRow spell={spellNamed('release')} selected={false} onSelect={() => {}} />);
    expect(screen.getByText('deduped')).toBeDefined();
    expect(screen.getByText('recorded')).toBeDefined();
  });

  it('renders the sentence with its nouns intact', () => {
    render(<SpellRow spell={spellNamed('welcome')} selected={false} onSelect={() => {}} />);
    expect(screen.getByText('The Doorkeeper')).toBeDefined();
    expect(screen.getByText('@initiate')).toBeDefined();
  });

  it('marks a hex as a hex, never as a charm', () => {
    render(<SpellRow spell={spellNamed('banish')} selected={false} onSelect={() => {}} />);
    expect(screen.getByText('hex')).toBeDefined();
    expect(screen.queryByText('charm')).toBeNull();
  });
});

describe('a spell opened as a page', () => {
  it('gives a charm the tenant its own controls', () => {
    render(<SpellPageView spell={spellNamed('release')} page={spellPages.release} />);
    expect(screen.getByRole('button', { name: 'Edit spell' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDefined();
  });

  it('teaches the invocation walk through its section labels', () => {
    render(<SpellPageView spell={spellNamed('release')} page={spellPages.release} />);
    for (const label of ['When', 'Who may', 'What happens', 'Guarantees']) {
      expect(screen.getByText(label), `missing section '${label}'`).toBeDefined();
    }
  });

  it('seals a hex — no edit, no pause, and it says why', () => {
    render(<SpellPageView spell={spellNamed('banish')} page={spellPages.banish} />);
    expect(screen.queryByRole('button', { name: 'Edit spell' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.getByText(/cannot be edited or automated/)).toBeDefined();
    expect(screen.getByText(/never automated/)).toBeDefined();
  });

  it('does not dress a hex as the tenant’s own artifact', () => {
    // Parchment means "yours". A hex is engineer-authored, so it must not get that
    // surface — the palette is load-bearing here, not decorative.
    const { container: hex } = render(
      <SpellPageView spell={spellNamed('banish')} page={spellPages.banish} />,
    );
    const { container: charm } = render(
      <SpellPageView spell={spellNamed('release')} page={spellPages.release} />,
    );
    const hexPane = within(hex).getByLabelText('Banish');
    const charmPane = within(charm).getByLabelText('Relay the deployment');
    expect(hexPane.className).not.toEqual(charmPane.className);
    expect(charmPane.className).toMatch(/on-page/);
    expect(hexPane.className).not.toMatch(/on-page/);
  });
});
