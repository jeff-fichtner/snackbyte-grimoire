// @vitest-environment node
/**
 * ClickUp is the SECOND source, so these tests are really about the registry's promise: a new
 * source is one module, and nothing downstream learns its name. The adapter-specific risks are
 * the two that silently break webhook verification everywhere — signing a re-serialized body
 * instead of the received bytes, and inventing a dedupe key when the source did not supply one.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { clickup } from '../../src/sources/clickup/adapter.js';

/** A taskStatusUpdated body in ClickUp's documented shape. */
const payload = {
  event: 'taskStatusUpdated',
  history_items: [
    {
      id: '2800763136717140857',
      type: 1,
      date: '1642734631523',
      field: 'status',
      parent_id: '162641062',
      user: { id: 183, username: 'Jeff', email: 'jeff@example.com', initials: 'J' },
      before: { status: 'to do', color: '#d3d3d3', type: 'open', orderindex: 0 },
      after: { status: 'in progress', color: '#a875ff', type: 'custom', orderindex: 1 },
    },
  ],
  task_id: '1vwwavv',
  webhook_id: '7fa3ec74-69a8-4530-a251-8a13730bd204',
};

const body = Buffer.from(JSON.stringify(payload), 'utf8');

describe('the clickup adapter', () => {
  it('signs with a bare hex digest, not github’s prefixed form', () => {
    const signature = clickup.sign(body, 'shared-secret');
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signature).not.toContain('=');
    expect(signature).toBe(createHmac('sha256', 'shared-secret').update(body).digest('hex'));
  });

  it('signs the received bytes, so a re-serialized body does not verify', () => {
    // The classic break: parse, re-stringify, sign. Key order and whitespace shift, and the
    // signature silently never matches. Proving it here keeps anyone from "tidying" the raw
    // body handling in server.ts.
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(body.toString('utf8')), null, 2));
    expect(clickup.sign(reserialized, 'shared-secret')).not.toBe(
      clickup.sign(body, 'shared-secret'),
    );
  });

  it('reads the event type from the body, since clickup sends no event header', () => {
    const event = clickup.parse(body, {});
    expect(event?.source).toBe('clickup');
    expect(event?.eventType).toBe('taskStatusUpdated');
  });

  it('takes its dedupe key from the history record id', () => {
    expect(clickup.parse(body, {})?.dedupeKey).toBe('2800763136717140857');
  });

  it('produces the SAME dedupe key for a redelivery of the same change', () => {
    // This is the property logistics depends on for exactly-once. If it ever fails, the
    // delivery chokepoint acts twice on one happening.
    const first = clickup.parse(body, {});
    const second = clickup.parse(Buffer.from(body), {});
    expect(first?.dedupeKey).toBe(second?.dedupeKey);
  });

  it('exposes the facts a spell can name', () => {
    expect(clickup.parse(body, {})?.facts).toEqual({
      task_id: '1vwwavv',
      field: 'status',
      status: 'in progress',
      status_before: 'to do',
      user: 'Jeff',
      url: 'https://app.clickup.com/t/1vwwavv',
    });
  });

  it('REFUSES a payload with no history record rather than inventing a dedupe key', () => {
    // Synthesizing a key here would make every redelivery look new, quietly downgrading
    // exactly-once to at-least-once while still claiming the guarantee. Refusing is honest.
    const withoutHistory = Buffer.from(
      JSON.stringify({ event: 'taskStatusUpdated', task_id: 'abc', history_items: [] }),
    );
    expect(clickup.parse(withoutHistory, {})).toBeNull();
  });

  it('returns null for an unnamed event, malformed json, and an empty body', () => {
    expect(clickup.parse(Buffer.from(JSON.stringify({ task_id: 'abc' })), {})).toBeNull();
    expect(clickup.parse(Buffer.from('{not json'), {})).toBeNull();
    expect(clickup.parse(Buffer.alloc(0), {})).toBeNull();
  });

  it('omits facts the payload does not carry instead of rendering them undefined', () => {
    const sparse = Buffer.from(
      JSON.stringify({ event: 'taskCreated', history_items: [{ id: 'h1' }] }),
    );
    expect(clickup.parse(sparse, {})?.facts).toEqual({});
  });
});
