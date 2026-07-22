/**
 * The Postgres implementation.
 *
 * Every tenant-scoped query carries `tenant_id` in its WHERE clause, and the only way to get
 * that value is from a `TenantRef` the law minted. The interface makes the omission
 * impossible; this file makes the inclusion real.
 */
import pg from 'pg';
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

/** Postgres raises this when a UNIQUE constraint rejects an insert. */
const UNIQUE_VIOLATION = '23505';

export class PgRepository implements Repository {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10 });
  }

  async findRegistration(registrationId: string): Promise<SourceRegistration | null> {
    const { rows } = await this.pool.query(
      `SELECT id, tenant_id, source, secret_ref
         FROM source_registrations
        WHERE id = $1 AND enabled`,
      [registrationId],
    );
    const row = rows[0];
    return row
      ? { id: row.id, tenantId: row.tenant_id, source: row.source, secretRef: row.secret_ref }
      : null;
  }

  async getApplication(applicationId: string): Promise<Application | null> {
    const { rows } = await this.pool.query(
      `SELECT id, binding, tenant_id, token_ref FROM applications WHERE id = $1 AND enabled`,
      [applicationId],
    );
    const row = rows[0];
    return row
      ? { id: row.id, binding: row.binding, tenantId: row.tenant_id, tokenRef: row.token_ref }
      : null;
  }

  async getPlatformApplication(binding: string): Promise<Application | null> {
    const { rows } = await this.pool.query(
      `SELECT id, binding, tenant_id, token_ref
         FROM applications
        WHERE binding = $1 AND tenant_id IS NULL AND enabled`,
      [binding],
    );
    const row = rows[0];
    return row
      ? { id: row.id, binding: row.binding, tenantId: row.tenant_id, tokenRef: row.token_ref }
      : null;
  }

  async findSpells(tenant: TenantRef, source: string, eventType: string): Promise<Spell[]> {
    const { rows } = await this.pool.query(
      `SELECT id, name, trigger_species, source, event_type, condition, verb, verb_config
         FROM spells
        WHERE tenant_id = $1 AND source = $2 AND event_type = $3 AND enabled`,
      [tenantId(tenant), source, eventType],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      triggerSpecies: row.trigger_species,
      source: row.source,
      eventType: row.event_type,
      condition: row.condition,
      verb: row.verb,
      verbConfig: row.verb_config,
    }));
  }

  async getDestination(tenant: TenantRef, destinationId: string): Promise<Destination | null> {
    const { rows } = await this.pool.query(
      `SELECT id, install_id, channel_ref
         FROM destinations
        WHERE id = $1 AND tenant_id = $2 AND enabled`,
      [destinationId, tenantId(tenant)],
    );
    const row = rows[0];
    return row ? { id: row.id, installId: row.install_id, channelRef: row.channel_ref } : null;
  }

  async resolveSecret(tenant: TenantRef, ref: string): Promise<string | null> {
    const { rows } = await this.pool.query(
      `SELECT value FROM secrets WHERE tenant_id = $1 AND ref = $2`,
      [tenantId(tenant), ref],
    );
    return rows[0]?.value ?? null;
  }

  /**
   * Claim the event by inserting the record as `pending`. The UNIQUE constraint on
   * (spell_id, dedupe_key) is the arbiter — two concurrent copies race into the database and
   * exactly one wins, where a check-then-act in application code would let both through.
   */
  async beginRecord(tenant: TenantRef, input: RecordInput): Promise<RecordHandle | 'duplicate'> {
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO records (tenant_id, spell_id, source, event_type, dedupe_key, outcome)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING id`,
        [tenantId(tenant), input.spellId, input.source, input.eventType, input.dedupeKey],
      );
      return { id: rows[0].id };
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) return 'duplicate';
      throw error;
    }
  }

  async settleRecord(
    tenant: TenantRef,
    handle: RecordHandle,
    outcome: TerminalOutcome,
    detail?: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE records
          SET outcome = $1, detail = $2, settled_at = now()
        WHERE id = $3 AND tenant_id = $4`,
      [outcome, detail ?? null, handle.id, tenantId(tenant)],
    );
  }

  async recordRefusal(tenant: TenantRef, input: RecordInput, detail?: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO records (tenant_id, spell_id, source, event_type, dedupe_key, outcome, detail, settled_at)
       VALUES ($1, $2, $3, $4, $5, 'refused', $6, now())
       ON CONFLICT (spell_id, dedupe_key) DO NOTHING`,
      [
        tenantId(tenant),
        input.spellId,
        input.source,
        input.eventType,
        input.dedupeKey,
        detail ?? null,
      ],
    );
  }

  async ping(): Promise<boolean> {
    const { rows } = await this.pool.query('SELECT 1 AS ok');
    return rows[0]?.ok === 1;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
