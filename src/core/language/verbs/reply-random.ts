/**
 * `reply_random` — reply to a command with a random line from a configured list.
 *
 * The composer's first effect primitive, and the whole point of the "patterns in code,
 * instances in data" split: the VERB is the mechanism (pick a line, fill in the event's facts,
 * reply), and the LINES are tenant data carried in the spell's config. `/spank` — "reply with a
 * random line from this list, mentioning the target" — is exactly one instance of it and invents
 * no verb; a hundred more commands are a hundred more rows.
 *
 * A charm (reversible, low blast radius) so a tenant may compose it. It replies to an invoker,
 * so `needsReturnChannel` is true — it is legal only under a trigger species that owes a reply
 * (an interaction), never a fire-and-forget webhook.
 */
import { InvalidRule, type Transform, render } from '../logic/index.js';
import { type Verb, type VerbContext, registerVerb } from './index.js';

/** The lines are the tenant's data; each is a template over the event's facts (`{caster}`, `{target}`). */
export interface ReplyRandomConfig {
  lines: string[];
}

/** Discord's hard message-content ceiling — a line that renders longer would be rejected anyway. */
const MAX_LINE = 2000;

export const replyRandom: Verb<ReplyRandomConfig> = {
  key: 'reply_random',
  verbClass: 'charm',
  needsReturnChannel: true,

  parse(raw: unknown): ReplyRandomConfig {
    if (typeof raw !== 'object' || raw === null) {
      throw new InvalidRule('reply_random config must be an object');
    }
    const lines = (raw as Record<string, unknown>).lines;
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new InvalidRule('reply_random needs a non-empty "lines" array');
    }
    for (const line of lines) {
      if (typeof line !== 'string' || line.length === 0) {
        throw new InvalidRule('every reply_random line must be a non-empty string');
      }
      if (line.length > MAX_LINE) {
        throw new InvalidRule(`a reply_random line exceeds the ${MAX_LINE}-character bound`);
      }
    }
    return { lines: lines as string[] };
  },

  async perform(ctx: VerbContext, config: ReplyRandomConfig): Promise<void> {
    const line = config.lines[Math.floor(Math.random() * config.lines.length)] as string;
    const transform: Transform = { template: line };
    await ctx.reply(render(transform, ctx.event));
  },
};

registerVerb(replyRandom);
