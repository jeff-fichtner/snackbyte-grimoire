// @vitest-environment node
/**
 * The github adapter was written against `release` payloads, so a `push` — the predecessor's
 * ONLY github route, and therefore the actual parity case — arrived with almost no facts and
 * rendered a template of blanks. These tests pin both event shapes so neither regresses into
 * the other's assumptions.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { github } from '../../src/sources/github/adapter.js';

function body(payload: unknown): Buffer {
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

const headers = (event: string) => ({
  'x-github-event': event,
  'x-github-delivery': 'd-1',
});

describe('the github adapter', () => {
  it('signs with the sha256= prefixed form', () => {
    const b = body({ hello: 'world' });
    expect(github.sign(b, 'secret')).toBe(
      `sha256=${createHmac('sha256', 'secret').update(b).digest('hex')}`,
    );
  });

  it('refuses a ping and anything without a delivery id', () => {
    expect(github.parse(body({}), headers('ping'))).toBeNull();
    expect(github.parse(body({}), { 'x-github-event': 'push' })).toBeNull();
    expect(github.parse(Buffer.from('{not json'), headers('push'))).toBeNull();
  });

  describe('a push', () => {
    const push = body({
      ref: 'refs/heads/main',
      compare: 'https://github.com/jeff-fichtner/snackbyte-grimoire/compare/a...b',
      repository: { full_name: 'jeff-fichtner/snackbyte-grimoire' },
      sender: { login: 'jeff-fichtner' },
      head_commit: {
        message:
          'fix(logic): one rule for an absent fact\n\nLonger body that must not\nreach the message.',
        url: 'https://github.com/jeff-fichtner/snackbyte-grimoire/commit/b',
      },
      commits: [{ id: 'a' }, { id: 'b' }],
    });

    it('names the branch without the refs/heads plumbing', () => {
      expect(github.parse(push, headers('push'))?.facts.branch).toBe('main');
      expect(github.parse(push, headers('push'))?.facts.ref).toBe('refs/heads/main');
    });

    it('takes only the first line of the commit message', () => {
      // An unbounded fact becomes an unbounded message, which the destination rejects.
      expect(github.parse(push, headers('push'))?.facts.commit_message).toBe(
        'fix(logic): one rule for an absent fact',
      );
    });

    it('carries the facts a push message actually needs', () => {
      const facts = github.parse(push, headers('push'))?.facts ?? {};
      expect(facts.repository).toBe('jeff-fichtner/snackbyte-grimoire');
      expect(facts.sender).toBe('jeff-fichtner');
      expect(facts.commit_count).toBe('2');
      expect(facts.compare).toContain('/compare/');
    });

    it('omits release-only facts rather than emitting empties', () => {
      const facts = github.parse(push, headers('push'))?.facts ?? {};
      expect(facts.tag).toBeUndefined();
      expect(facts.release_name).toBeUndefined();
    });

    it('handles a tag push, which has no branch', () => {
      const tagPush = body({ ref: 'refs/tags/v1.2.0', repository: { full_name: 'a/b' } });
      const facts = github.parse(tagPush, headers('push'))?.facts ?? {};
      expect(facts.ref).toBe('refs/tags/v1.2.0');
      expect(facts.branch).toBeUndefined();
    });
  });

  describe('a release', () => {
    const release = body({
      action: 'published',
      repository: { full_name: 'jeff-fichtner/snackbyte-grimoire' },
      sender: { login: 'jeff-fichtner' },
      release: {
        tag_name: 'v1.2.0',
        name: 'The Invocation',
        html_url: 'https://x/releases/v1.2.0',
      },
    });

    it('still carries its own facts, unaffected by the push additions', () => {
      const facts = github.parse(release, headers('release'))?.facts ?? {};
      expect(facts).toEqual({
        action: 'published',
        repository: 'jeff-fichtner/snackbyte-grimoire',
        sender: 'jeff-fichtner',
        tag: 'v1.2.0',
        release_name: 'The Invocation',
        url: 'https://x/releases/v1.2.0',
      });
    });
  });
});
