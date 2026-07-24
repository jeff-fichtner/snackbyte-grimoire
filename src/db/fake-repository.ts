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
  CreateFaceInput,
  Destination,
  Face,
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
interface OwnedFace extends Face {
  tenantId: string;
}
interface StoredSecret {
  tenantId: string;
  ref: string;
  value: string;
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
  secrets?: StoredSecret[];
  faces?: OwnedFace[];
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
  /** Mutable so putSecret/deleteSecret and the face lifecycle can write at runtime. */
  private secretStore: StoredSecret[];
  private faces: OwnedFace[];
  /** Set true to make every call reject, for readiness and store-unavailable tests. */
  public unavailable = false;

  constructor(private readonly seed: FakeSeed = {}) {
    this.secretStore = [...(seed.secrets ?? [])];
    this.faces = [...(seed.faces ?? [])];
  }

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
    const found = this.secretStore.find((s) => s.ref === ref && s.tenantId === tenantId(tenant));
    return found?.value ?? null;
  }

  async putSecret(tenant: TenantRef, ref: string, value: string): Promise<void> {
    this.live();
    const existing = this.secretStore.find((s) => s.ref === ref && s.tenantId === tenantId(tenant));
    if (existing) existing.value = value;
    else this.secretStore.push({ tenantId: tenantId(tenant), ref, value });
  }

  async deleteSecret(tenant: TenantRef, ref: string): Promise<void> {
    this.live();
    this.secretStore = this.secretStore.filter(
      (s) => !(s.ref === ref && s.tenantId === tenantId(tenant)),
    );
  }

  async createFace(tenant: TenantRef, input: CreateFaceInput): Promise<Face> {
    this.live();
    const face: OwnedFace = {
      id: String(this.nextId++),
      tenantId: tenantId(tenant),
      installId: input.installId,
      channelRef: input.channelRef,
      name: input.name,
      avatarUrl: input.avatarUrl ?? null,
      secretRef: input.secretRef,
      origin: input.origin,
    };
    this.faces.push(face);
    return face;
  }

  async listFaces(tenant: TenantRef, channelRef?: string): Promise<Face[]> {
    this.live();
    return this.faces.filter(
      (f) =>
        f.tenantId === tenantId(tenant) &&
        (channelRef === undefined || f.channelRef === channelRef),
    );
  }

  async getFace(tenant: TenantRef, faceId: string): Promise<Face | null> {
    this.live();
    const found = this.faces.find((f) => f.id === faceId);
    if (!found) return null;
    if (found.tenantId !== tenantId(tenant)) {
      throw new CrossTenantAccess(`face ${faceId}`, tenantId(tenant), found.tenantId);
    }
    return found;
  }

  async renameFace(
    tenant: TenantRef,
    faceId: string,
    changes: { name?: string; avatarUrl?: string | null },
  ): Promise<void> {
    this.live();
    const found = this.faces.find((f) => f.id === faceId);
    if (!found) return;
    if (found.tenantId !== tenantId(tenant)) {
      throw new CrossTenantAccess(`face ${faceId}`, tenantId(tenant), found.tenantId);
    }
    if (changes.name !== undefined) found.name = changes.name;
    if (changes.avatarUrl !== undefined) found.avatarUrl = changes.avatarUrl;
  }

  async deleteFace(
    tenant: TenantRef,
    faceId: string,
  ): Promise<{ wasLastInChannel: boolean } | null> {
    this.live();
    const found = this.faces.find((f) => f.id === faceId);
    if (!found) return null;
    if (found.tenantId !== tenantId(tenant)) {
      throw new CrossTenantAccess(`face ${faceId}`, tenantId(tenant), found.tenantId);
    }
    this.faces = this.faces.filter((f) => f.id !== faceId);
    const remaining = this.faces.filter(
      (f) =>
        f.tenantId === tenantId(tenant) &&
        f.installId === found.installId &&
        f.channelRef === found.channelRef,
    ).length;
    return { wasLastInChannel: remaining === 0 };
  }

  async countChannelFaces(
    tenant: TenantRef,
    installId: string,
    channelRef: string,
  ): Promise<number> {
    this.live();
    return this.faces.filter(
      (f) =>
        f.tenantId === tenantId(tenant) && f.installId === installId && f.channelRef === channelRef,
    ).length;
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
