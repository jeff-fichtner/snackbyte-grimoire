/**
 * An in-memory store for tests.
 *
 * It is deliberately hostile: any read that would cross a tenant boundary THROWS rather than
 * returning empty. A fake that quietly returns `[]` for the wrong tenant would let an
 * isolation bug pass every test and only show up in production, against someone else's data.
 * Here a crossing is a loud failure at the exact call that caused it.
 */
import { type TenantRef, tenantId } from '../core/law/tenant-ref.js';
import type { TerminalOutcome } from '../core/logistics/outcome.js';
import type {
  Application,
  Destination,
  RecordHandle,
  RecordInput,
  Repository,
  SourceRegistration,
  Spell,
} from './repository.js';

interface OwnedSpell extends Spell {
  tenantId: string;
}
interface OwnedDestination extends Destination {
  tenantId: string;
}
interface StoredRecord extends RecordInput {
  id: string;
  tenantId: string;
  outcome: string;
  detail?: string;
}

export interface FakeSeed {
  registrations?: SourceRegistration[];
  applications?: Application[];
  spells?: OwnedSpell[];
  destinations?: OwnedDestination[];
  secrets?: { tenantId: string; ref: string; value: string }[];
}

export class CrossTenantAccess extends Error {
  constructor(what: string, asked: string, owner: string) {
    super(`cross-tenant access: tenant ${asked} asked for ${what} owned by ${owner}`);
    this.name = 'CrossTenantAccess';
  }
}

export class FakeRepository implements Repository {
  private records: StoredRecord[] = [];
  private nextId = 1;
  /** Set true to make every call reject, for readiness and store-unavailable tests. */
  public unavailable = false;

  constructor(private readonly seed: FakeSeed = {}) {}

  private live(): void {
    if (this.unavailable) throw new Error('store unavailable');
  }

  async findRegistration(registrationId: string): Promise<SourceRegistration | null> {
    this.live();
    return this.seed.registrations?.find((r) => r.id === registrationId) ?? null;
  }

  async getApplication(applicationId: string): Promise<Application | null> {
    this.live();
    return this.seed.applications?.find((a) => a.id === applicationId) ?? null;
  }

  async getPlatformApplication(binding: string): Promise<Application | null> {
    this.live();
    return (
      this.seed.applications?.find((a) => a.binding === binding && a.tenantId === null) ?? null
    );
  }

  async findSpells(tenant: TenantRef, source: string, eventType: string): Promise<Spell[]> {
    this.live();
    return (this.seed.spells ?? []).filter(
      (s) => s.tenantId === tenantId(tenant) && s.source === source && s.eventType === eventType,
    );
  }

  async getDestination(tenant: TenantRef, destinationId: string): Promise<Destination | null> {
    this.live();
    const found = this.seed.destinations?.find((d) => d.id === destinationId);
    if (!found) return null;
    if (found.tenantId !== tenantId(tenant)) {
      throw new CrossTenantAccess(`destination ${destinationId}`, tenantId(tenant), found.tenantId);
    }
    return found;
  }

  async resolveSecret(tenant: TenantRef, ref: string): Promise<string | null> {
    this.live();
    const found = this.seed.secrets?.find((s) => s.ref === ref);
    if (!found) return null;
    if (found.tenantId !== tenantId(tenant)) {
      throw new CrossTenantAccess(`secret ${ref}`, tenantId(tenant), found.tenantId);
    }
    return found.value;
  }

  async beginRecord(tenant: TenantRef, input: RecordInput): Promise<RecordHandle | 'duplicate'> {
    this.live();
    const held = this.records.some(
      (r) => r.spellId === input.spellId && r.dedupeKey === input.dedupeKey,
    );
    if (held) return 'duplicate';
    const id = String(this.nextId++);
    this.records.push({ ...input, id, tenantId: tenantId(tenant), outcome: 'pending' });
    return { id };
  }

  async settleRecord(
    tenant: TenantRef,
    handle: RecordHandle,
    outcome: TerminalOutcome,
    detail?: string,
  ): Promise<void> {
    this.live();
    const found = this.records.find((r) => r.id === handle.id);
    if (!found) throw new Error(`no record ${handle.id}`);
    if (found.tenantId !== tenantId(tenant)) {
      throw new CrossTenantAccess(`record ${handle.id}`, tenantId(tenant), found.tenantId);
    }
    found.outcome = outcome;
    found.detail = detail;
  }

  async recordRefusal(tenant: TenantRef, input: RecordInput, detail?: string): Promise<void> {
    this.live();
    this.records.push({
      ...input,
      id: String(this.nextId++),
      tenantId: tenantId(tenant),
      outcome: 'refused',
      detail,
    });
  }

  async recordDeduped(tenant: TenantRef, input: RecordInput): Promise<void> {
    this.live();
    this.records.push({
      ...input,
      id: String(this.nextId++),
      tenantId: tenantId(tenant),
      outcome: 'deduped',
    });
  }

  async ping(): Promise<boolean> {
    return !this.unavailable;
  }

  async close(): Promise<void> {}

  /** Test-only view. Not part of the interface. */
  all(): readonly StoredRecord[] {
    return this.records;
  }
}
