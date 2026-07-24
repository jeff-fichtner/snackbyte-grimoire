/**
 * What core needs from a chat platform, stated by core.
 *
 * The dependency runs binding → core, never the reverse: core owns this interface, and a
 * binding implements it and is injected at the composition root. The predecessor inverted
 * this — its routing engine imported its Discord module — which is why a second platform
 * would have been a rewrite there rather than a new folder.
 */

/**
 * A face a message speaks through — a per-message persona backed by a channel's credential.
 *
 * `credential` is the resolved speaking credential (a webhook URL, in Discord's case), placed
 * on the message by the invocation just before the chokepoint. Core treats it as opaque; only
 * the binding knows how to use it. Its field name is redacted at the logging boundary — a
 * capability URL is a secret (Constitution VII).
 */
export interface OutboundFace {
  credential: string;
  username: string;
  avatarUrl?: string;
}

export interface OutboundMessage {
  /** The platform's own id for the place, from a destination the tenant owns. */
  channelRef: string;
  content: string;
  /** Present ⇒ speak through this face, wearing its name/avatar, instead of as the application. */
  face?: OutboundFace;
}

/** Thrown by a binding when the platform refuses in a way retrying cannot fix. */
export class PermanentDeliveryFailure extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PermanentDeliveryFailure';
  }
}

/** Thrown when the platform is unhappy now but might not be shortly. */
export class TransientDeliveryFailure extends Error {
  constructor(
    message: string,
    /** Seconds the platform asked us to wait, when it said. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'TransientDeliveryFailure';
  }
}

export interface Binding {
  readonly key: string;
  /**
   * Speak, as a given application identity — or, when `message.face` is set, through that face.
   *
   * `applicationId` is required and there is no overload without it — identity is a lookup,
   * never a constant, so a second application (a tenant's own, or one connection of a
   * sharded pool) is a row rather than a change at every call site.
   */
  send(applicationId: string, message: OutboundMessage): Promise<void>;

  /**
   * Face lifecycle. Model-named on purpose — no "webhook" appears in this interface, so core
   * names no platform (Constitution I); the binding maps these to whatever mechanism it owns.
   *
   * Only three operations touch the platform, because a face's name and avatar are applied
   * PER MESSAGE (in `send`), so renaming a face is a pure store update with no platform call.
   * `establishFace` needs the community's management authority (least privilege, Constitution
   * II) and takes an `applicationId`; `adopt`/`retire` act on possession of the credential
   * alone. Listing faces is a store read (they are rows) and is not here.
   */
  establishFace(
    applicationId: string,
    channelRef: string,
    name: string,
  ): Promise<{ credential: string }>;
  /** Validate that a supplied credential is real and reachable, before it is adopted. */
  adoptFace(credential: string): Promise<void>;
  retireFace(credential: string): Promise<void>;
}
