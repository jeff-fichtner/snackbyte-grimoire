/**
 * GitHub as a source.
 *
 * Signature scheme is GitHub's own: `sha256=` + HMAC-SHA256 of the exact request bytes.
 * The bytes matter — `JSON.parse` then `JSON.stringify` does not round-trip (key order,
 * whitespace, unicode escapes all shift), so a signature checked against a re-serialized
 * body silently never matches. That is the most common way webhook verification is broken.
 */
import { createHmac } from 'node:crypto';
import type { CanonicalEvent } from '../../core/language/event.js';
import { type SourceAdapter, registerSource } from '../types.js';

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export const github: SourceAdapter = {
  key: 'github',
  signatureHeader: 'x-hub-signature-256',

  sign(body: Buffer, secret: string): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  },

  parse(body, headers): CanonicalEvent | null {
    const eventType = headers['x-github-event'];
    if (!eventType || eventType === 'ping') return null;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }

    // GitHub's delivery id identifies the happening. Two deliveries of the same event carry
    // the same id, which is exactly what makes exactly-once reachable.
    const delivery = headers['x-github-delivery'];
    if (!delivery) return null;

    const repository = payload.repository as Record<string, unknown> | undefined;
    const release = payload.release as Record<string, unknown> | undefined;
    const sender = payload.sender as Record<string, unknown> | undefined;
    const headCommit = payload.head_commit as Record<string, unknown> | undefined;

    const facts: Record<string, string> = {};
    const put = (key: string, value: string | undefined): void => {
      if (value !== undefined) facts[key] = value;
    };

    put('action', str(payload.action));
    put('repository', str(repository?.full_name));
    put('sender', str(sender?.login));
    put('tag', str(release?.tag_name));
    put('release_name', str(release?.name));
    put('url', str(release?.html_url));

    // Push facts. Without these a push carries only `repository` and `sender` — every other
    // fact belongs to a release — so a spell written against a push renders a template full
    // of blanks. That is the predecessor's actual behaviour (its one github route was
    // `push`), so it is parity, not a new feature.
    const ref = str(payload.ref);
    put('ref', ref);
    // The branch alone is what a message wants to say; `refs/heads/` is plumbing.
    if (ref?.startsWith('refs/heads/')) put('branch', ref.slice('refs/heads/'.length));
    put('compare', str(payload.compare));
    // First line only. A commit body can run to hundreds of lines, and the transform is a
    // substitution with no way to truncate — an unbounded fact here becomes an unbounded
    // message, which the destination then rejects.
    const message = str(headCommit?.message);
    if (message !== undefined) put('commit_message', message.split('\n', 1)[0] ?? '');
    put('commit_url', str(headCommit?.url));
    if (Array.isArray(payload.commits)) put('commit_count', String(payload.commits.length));

    return { source: 'github', eventType, dedupeKey: delivery, facts };
  },
};

registerSource(github);
