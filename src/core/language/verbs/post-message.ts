/**
 * `post_message` — say something in a place the tenant owns.
 *
 * A charm: reversible in the sense that matters (a message can be deleted, nothing is
 * destroyed) and low blast radius. It speaks outward and replies to nobody, so it needs no
 * return channel and is legal under every trigger species.
 */
import { InvalidRule, type Transform, parseTransform, render } from '../logic/index.js';
import { type Verb, type VerbContext, registerVerb } from './index.js';

export interface PostMessageConfig {
  destinationId: string;
  transform: Transform;
}

export const postMessage: Verb<PostMessageConfig> = {
  key: 'post_message',
  verbClass: 'charm',
  needsReturnChannel: false,

  parse(raw: unknown): PostMessageConfig {
    if (typeof raw !== 'object' || raw === null) {
      throw new InvalidRule('post_message config must be an object');
    }
    const node = raw as Record<string, unknown>;
    if (typeof node.destinationId !== 'string' || node.destinationId === '') {
      throw new InvalidRule('post_message needs a destinationId');
    }
    return { destinationId: node.destinationId, transform: parseTransform(node.transform) };
  },

  async perform(ctx: VerbContext, config: PostMessageConfig): Promise<void> {
    await ctx.speak(config.destinationId, render(config.transform, ctx.event));
  },
};

registerVerb(postMessage);
