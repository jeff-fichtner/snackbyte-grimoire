// @vitest-environment node
/**
 * The rule language must stay TOTAL: every accepted rule terminates, touches nothing but the
 * event's facts, and an unrecognized shape is refused rather than passed through. The last
 * one is what stops `condition` becoming an escape hatch as the vocabulary grows.
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalEvent } from '../../src/core/language/event.js';
import {
  InvalidRule,
  evaluate,
  parsePredicate,
  parseTransform,
  render,
} from '../../src/core/language/logic/index.js';

const event: CanonicalEvent = {
  source: 'github',
  eventType: 'release',
  dedupeKey: 'delivery-1',
  facts: { tag: 'v1.2.0', action: 'published', repository: 'snackbyte/grimoire' },
};

describe('predicates', () => {
  it('treats an absent condition as "always"', () => {
    expect(evaluate(parsePredicate(null), event)).toBe(true);
    expect(evaluate(parsePredicate(undefined), event)).toBe(true);
  });

  it('matches and declines on exact equality', () => {
    expect(
      evaluate(parsePredicate({ op: 'equals', fact: 'action', value: 'published' }), event),
    ).toBe(true);
    expect(
      evaluate(parsePredicate({ op: 'equals', fact: 'action', value: 'deleted' }), event),
    ).toBe(false);
  });

  it('supports the bounded pattern forms', () => {
    expect(evaluate(parsePredicate({ op: 'startsWith', fact: 'tag', value: 'v' }), event)).toBe(
      true,
    );
    expect(evaluate(parsePredicate({ op: 'endsWith', fact: 'tag', value: '.0' }), event)).toBe(
      true,
    );
    expect(
      evaluate(
        parsePredicate({ op: 'oneOf', fact: 'action', values: ['published', 'edited'] }),
        event,
      ),
    ).toBe(true);
  });

  it('composes with not/all/any', () => {
    const rule = {
      op: 'all',
      of: [
        { op: 'startsWith', fact: 'tag', value: 'v' },
        { op: 'not', of: { op: 'equals', fact: 'action', value: 'deleted' } },
      ],
    };
    expect(evaluate(parsePredicate(rule), event)).toBe(true);
  });

  it('treats a missing fact as not-matching rather than throwing', () => {
    expect(evaluate(parsePredicate({ op: 'equals', fact: 'nope', value: 'x' }), event)).toBe(false);
  });

  it('REFUSES an unknown operator — the language is closed', () => {
    expect(() => parsePredicate({ op: 'regex', fact: 'tag', value: '.*' })).toThrow(InvalidRule);
    expect(() => parsePredicate({ op: 'eval', code: 'process.exit(1)' })).toThrow(InvalidRule);
  });

  it('refuses a malformed rule rather than coercing it', () => {
    expect(() => parsePredicate({ op: 'equals', fact: 1, value: 2 })).toThrow(InvalidRule);
    expect(() => parsePredicate({ op: 'oneOf', fact: 'tag', values: 'v1' })).toThrow(InvalidRule);
    expect(() => parsePredicate('always')).toThrow(InvalidRule);
  });
});

describe('transforms', () => {
  it('substitutes named facts', () => {
    const t = parseTransform({ template: '{repository} released {tag}' });
    expect(render(t, event)).toBe('snackbyte/grimoire released v1.2.0');
  });

  it('renders an unknown fact as empty rather than failing the whole spell', () => {
    // A source that stops sending an optional field should thin the message, not cause an
    // outage.
    expect(render(parseTransform({ template: 'by {missing}!' }), event)).toBe('by !');
  });

  it('evaluates nothing — a brace expression is an unknown fact, not code', () => {
    process.env.SECRET_FOR_TEST = 'must-never-appear';
    // The braces ARE placeholder syntax, so this reads as a fact named
    // "process.env.SECRET_FOR_TEST" — which does not exist, so it renders empty. What
    // matters is that nothing is evaluated and no environment variable is reached.
    const t = parseTransform({ template: '${process.env.SECRET_FOR_TEST} {tag}' });
    const out = render(t, event);
    expect(out).not.toContain('must-never-appear');
    expect(out).toBe('$ v1.2.0');
    delete process.env.SECRET_FOR_TEST;
  });

  it('does not treat template literals or expressions as anything but text', () => {
    // Not even a placeholder: '+' is not a legal fact character, so the whole span is
    // literal text. The syntax is narrow on purpose.
    const t = parseTransform({ template: '1+1 = ${1+1} and `backticks` stay' });
    expect(render(t, event)).toBe('1+1 = ${1+1} and `backticks` stay');
  });

  it('bounds template length', () => {
    expect(() => parseTransform({ template: 'x'.repeat(4001) })).toThrow(InvalidRule);
  });
});

describe('an absent fact', () => {
  /**
   * A regression suite for a bug that reached production. Each operator used to answer this
   * question differently — `equals` against `undefined`, `oneOf` against a NUL sentinel, the
   * pattern forms against `''` — so the obvious way to write "this fact has a value" matched
   * exactly the events where it did not. These tests exist to keep the three in agreement.
   */
  const missing: CanonicalEvent = {
    source: 'clickup',
    eventType: 'taskStatusUpdated',
    dedupeKey: 'history-1',
    facts: { status: 'backlog' }, // no `status_before` — the shape a task CREATION produces
  };

  it('reads as the empty string for equals', () => {
    expect(evaluate(parsePredicate({ op: 'equals', fact: 'nope', value: '' }), missing)).toBe(true);
  });

  it('reads as the empty string for the pattern forms', () => {
    expect(evaluate(parsePredicate({ op: 'startsWith', fact: 'nope', value: '' }), missing)).toBe(
      true,
    );
    expect(evaluate(parsePredicate({ op: 'endsWith', fact: 'nope', value: 'x' }), missing)).toBe(
      false,
    );
  });

  it('reads as the empty string for oneOf, so it matches a list only when "" is in it', () => {
    expect(
      evaluate(parsePredicate({ op: 'oneOf', fact: 'nope', values: ['a', 'b'] }), missing),
    ).toBe(false);
    expect(
      evaluate(parsePredicate({ op: 'oneOf', fact: 'nope', values: ['', 'b'] }), missing),
    ).toBe(true);
  });

  it('DECLINES a task creation via not(equals(status_before, "")) — the bug that shipped', () => {
    const hasPrevious = parsePredicate({
      op: 'not',
      of: { op: 'equals', fact: 'status_before', value: '' },
    });
    // A creation carries no previous status, so the spell must not speak.
    expect(evaluate(hasPrevious, missing)).toBe(false);
    // A genuine transition does.
    expect(
      evaluate(hasPrevious, {
        ...missing,
        facts: { status: 'in development', status_before: 'backlog' },
      }),
    ).toBe(true);
  });
});
