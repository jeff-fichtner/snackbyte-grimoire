// @vitest-environment node
/**
 * reply_random — the composer's first effect primitive. The properties that matter: the lines
 * are tenant data, validated as non-empty templates; perform picks one and renders it over the
 * event's facts through the RETURN channel (reply), not the outbound chokepoint; and its config
 * is refused when malformed rather than defaulted.
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalEvent } from '../../src/core/language/event.js';
import { InvalidRule } from '../../src/core/language/logic/index.js';
import { replyRandom } from '../../src/core/language/verbs/reply-random.js';
import type { VerbContext } from '../../src/core/language/verbs/index.js';

const event: CanonicalEvent = {
  source: 'discord',
  eventType: 'spank',
  dedupeKey: 'i-1',
  facts: { caster: 'Jeff', target: '<@1>' },
};

function harness(ev: CanonicalEvent = event): { ctx: VerbContext; replies: string[] } {
  const replies: string[] = [];
  const ctx: VerbContext = {
    event: ev,
    speak: async () => {
      throw new Error('a reply verb must not speak outward');
    },
    speakThroughFace: async () => {
      throw new Error('a reply verb must not speak through a face');
    },
    reply: async (content) => {
      replies.push(content);
    },
  };
  return { ctx, replies };
}

describe('reply_random', () => {
  it('is a composable charm that owes a return channel', () => {
    expect(replyRandom.verbClass).toBe('charm');
    expect(replyRandom.needsReturnChannel).toBe(true);
  });

  it('renders the single line over the facts and replies (never speaks)', async () => {
    const { ctx, replies } = harness();
    await replyRandom.perform(ctx, { lines: ['🍑 {caster} spanks {target}!'] });
    expect(replies).toEqual(['🍑 Jeff spanks <@1>!']);
  });

  it('replies with one of the configured lines, rendered', async () => {
    const { ctx, replies } = harness();
    const lines = ['A {target}', 'B {target}', 'C {target}'];
    await replyRandom.perform(ctx, { lines });
    expect(['A <@1>', 'B <@1>', 'C <@1>']).toContain(replies[0]);
  });

  it('refuses empty, missing, non-string, or over-long lines', () => {
    expect(() => replyRandom.parse({ lines: [] })).toThrow(InvalidRule);
    expect(() => replyRandom.parse({})).toThrow(InvalidRule);
    expect(() => replyRandom.parse({ lines: ['ok', 123] })).toThrow(InvalidRule);
    expect(() => replyRandom.parse({ lines: [''] })).toThrow(InvalidRule);
    expect(() => replyRandom.parse({ lines: ['x'.repeat(2001)] })).toThrow(InvalidRule);
    expect(() => replyRandom.parse('nope')).toThrow(InvalidRule);
  });

  it('accepts a well-formed lines array', () => {
    expect(replyRandom.parse({ lines: ['one', 'two'] })).toEqual({ lines: ['one', 'two'] });
  });
});
