/**
 * The store, seen from above.
 *
 * Every method takes a `TenantRef` first. That is the whole design: an unscoped query is not
 * discouraged, it is unrepresentable — there is no overload that omits the reference, and the
 * reference cannot be built from request input. `ping` is the sole exception, and it reads
 * nothing.
 */
import type { TenantRef } from '../core/law/tenant-ref.js';
import type { Outcome, TerminalOutcome } from '../core/logistics/outcome.js';

/** A registration, as the law needs it before anything is verified. */
export interface SourceRegistration {
  id: string;
  tenantId: string;
  source: string;
  secretRef: string;
}

export interface Spell {
  id: string;
  name: string;
  triggerSpecies: string;
  source: string;
  eventType: string;
  condition: unknown | null;
  verb: string;
  verbConfig: unknown;
}

export interface Destination {
  id: string;
  installId: string;
  channelRef: string;
}

/** The platform's identity on one binding. Not tenant-scoped — see data-model.md. */
export interface Application {
  id: string;
  binding: string;
  tenantId: string | null;
  tokenRef: string;
}

export interface RecordInput {
  spellId: string | null;
  source: string;
  eventType: string;
  dedupeKey: string;
}

/** A claim on one (spell, event). Holding one means nobody else may act on it. */
export interface RecordHandle {
  readonly id: string;
}

export interface Repository {
  /**
   * Look up a registration by the untrusted selector from the URL.
   *
   * Returns the row or null — and returning null must NOT short-circuit the caller, because
   * an unknown selector and a bad signature have to cost the same. See `authenticate`.
   */
  findRegistration(registrationId: string): Promise<SourceRegistration | null>;

  /** The platform identity a binding speaks through. Resolved by id, never by constant. */
  getApplication(applicationId: string): Promise<Application | null>;

  /** The one application for a binding whose tenant_id is NULL. */
  getPlatformApplication(binding: string): Promise<Application | null>;

  findSpells(tenant: TenantRef, source: string, eventType: string): Promise<Spell[]>;
  getDestination(tenant: TenantRef, destinationId: string): Promise<Destination | null>;

  /** Resolves a reference to a value. The only way a secret is ever read. */
  resolveSecret(tenant: TenantRef, ref: string): Promise<string | null>;

  /**
   * Claim an event for a spell, writing the record as `pending`.
   *
   * Returns `'duplicate'` when the claim is already held. The caller never asks "was this
   * delivered?" — it tries to claim and is told if someone already has, which removes the
   * check-then-act race by construction.
   */
  beginRecord(tenant: TenantRef, input: RecordInput): Promise<RecordHandle | 'duplicate'>;

  /** Settle a claimed record to its terminal outcome. */
  settleRecord(
    tenant: TenantRef,
    handle: RecordHandle,
    outcome: TerminalOutcome,
    detail?: string,
  ): Promise<void>;

  /** Record something the law refused, where no spell was reached. */
  recordRefusal(tenant: TenantRef, input: RecordInput, detail?: string): Promise<void>;

  /** Reachability, for readiness. Reads no tenant data, so it takes no reference. */
  ping(): Promise<boolean>;

  close(): Promise<void>;
}

export type { Outcome };
