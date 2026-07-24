// @vitest-environment node
/**
 * `post_message` speaks one of two ways, and exactly one: as the application to a destination,
 * or through a face. Both-or-neither is a refused shape, not a silent default — that is what
 * keeps a mis-typed spell from quietly posting as the wrong identity.
 */
import { describe, expect, it } from 'vitest';
import { InvalidRule } from '../../src/core/language/logic/index.js';
import { postMessage } from '../../src/core/language/verbs/post-message.js';

const transform = { template: '{tag}' };

describe('post_message config', () => {
  it('accepts a destinationId (speak as the application)', () => {
    expect(postMessage.parse({ destinationId: 'd-1', transform })).toEqual({
      destinationId: 'd-1',
      transform,
    });
  });

  it('accepts a faceId (speak through a face)', () => {
    expect(postMessage.parse({ faceId: 'f-1', transform })).toEqual({ faceId: 'f-1', transform });
  });

  it('refuses BOTH a destinationId and a faceId', () => {
    expect(() => postMessage.parse({ destinationId: 'd-1', faceId: 'f-1', transform })).toThrow(
      InvalidRule,
    );
  });

  it('refuses NEITHER', () => {
    expect(() => postMessage.parse({ transform })).toThrow(InvalidRule);
  });

  it('refuses an empty-string target as absent', () => {
    expect(() => postMessage.parse({ destinationId: '', faceId: '', transform })).toThrow(
      InvalidRule,
    );
  });

  it('still refuses a non-object config', () => {
    expect(() => postMessage.parse('nope')).toThrow(InvalidRule);
  });
});
