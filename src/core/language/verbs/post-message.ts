/**
 * `post_message` — say something in a place the tenant owns.
 *
 * A charm: reversible in the sense that matters (a message can be deleted, nothing is
 * destroyed) and low blast radius. It speaks outward and replies to nobody, so it needs no
 * return channel and is legal under every trigger species.
 *
 * It speaks one of two ways, exactly one per spell: as the application to a `destinationId`
 * (001), or through a `faceId` (002) — wearing that face's name and avatar. Both flow through
 * the one delivery chokepoint; only the identity differs.
 */
import { InvalidRule, type Transform, parseTransform, render } from '../logic/index.js';
import { type Verb, type VerbContext, registerVerb } from './index.js';

export type PostMessageConfig =
  | { destinationId: string; faceId?: undefined; transform: Transform }
  | { faceId: string; destinationId?: undefined; transform: Transform };

export const postMessage: Verb<PostMessageConfig> = {
  key: 'post_message',
  verbClass: 'charm',
  needsReturnChannel: false,

  parse(raw: unknown): PostMessageConfig {
    if (typeof raw !== 'object' || raw === null) {
      throw new InvalidRule('post_message config must be an object');
    }
    const node = raw as Record<string, unknown>;
    const transform = parseTransform(node.transform);

    const hasDestination = typeof node.destinationId === 'string' && node.destinationId !== '';
    const hasFace = typeof node.faceId === 'string' && node.faceId !== '';

    // Exactly one target. Both or neither is a refused shape, not a silent default.
    if (hasDestination === hasFace) {
      throw new InvalidRule('post_message needs exactly one of destinationId or faceId');
    }
    return hasFace
      ? { faceId: node.faceId as string, transform }
      : { destinationId: node.destinationId as string, transform };
  },

  async perform(ctx: VerbContext, config: PostMessageConfig): Promise<void> {
    const content = render(config.transform, ctx.event);
    if (config.faceId !== undefined) await ctx.speakThroughFace(config.faceId, content);
    else await ctx.speak(config.destinationId, content);
  },
};

registerVerb(postMessage);
