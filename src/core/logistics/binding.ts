/**
 * What core needs from a chat platform, stated by core.
 *
 * The dependency runs binding → core, never the reverse: core owns this interface, and a
 * binding implements it and is injected at the composition root. The predecessor inverted
 * this — its routing engine imported its Discord module — which is why a second platform
 * would have been a rewrite there rather than a new folder.
 */

export interface OutboundMessage {
  /** The platform's own id for the place, from a destination the tenant owns. */
  channelRef: string;
  content: string;
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
   * Speak, as a given application identity.
   *
   * `applicationId` is required and there is no overload without it — identity is a lookup,
   * never a constant, so a second application (a tenant's own, or one connection of a
   * sharded pool) is a row rather than a change at every call site.
   */
  send(applicationId: string, message: OutboundMessage): Promise<void>;
}
