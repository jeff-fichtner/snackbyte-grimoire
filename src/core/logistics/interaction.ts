/**
 * What core needs from a binding to receive an interaction (a slash command, today).
 *
 * The dependency runs binding → core, exactly as it does for outbound `Binding`. Discord's
 * Ed25519 check, its payload shape, and its callback JSON are the binding's business; core sees
 * only `verify`/`parse` and opaque response bodies. A second binding implements this differently
 * and nothing in the walk changes — the same claim the source adapters make for inbound webhooks.
 */
import type { CanonicalEvent } from '../language/event.js';

/** A slash-command invocation, normalized: which guild it came from + the event core matches on. */
export interface CommandInvocation {
  /** The community (guild) the command was invoked in — resolved to a tenant by the law. */
  guildRef: string;
  /** `source` = the binding key, `eventType` = the command name; `facts` carry caster/target/options. */
  event: CanonicalEvent;
}

export type ParsedInteraction =
  | { readonly kind: 'ping' }
  | { readonly kind: 'command'; readonly command: CommandInvocation }
  /** A shape we do not act on (a component, a modal, an unmodelled command) — answered, not run. */
  | { readonly kind: 'ignore' };

export interface InteractionAdapter {
  /** True iff the request genuinely came from the platform (Discord's Ed25519 over timestamp+body). */
  verify(timestamp: string, rawBody: Buffer, signature: string): boolean;
  parse(rawBody: Buffer): ParsedInteraction;
  /** The handshake answer the platform expects when it probes the endpoint URL. */
  pong(): unknown;
  /** A public in-channel answer, pinging whoever the content mentions. */
  message(content: string): unknown;
  /** A private, caller-only answer — for a refusal the whole channel need not witness. */
  ephemeral(content: string): unknown;
}
