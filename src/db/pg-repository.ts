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
  CreateFaceInput,
  Destination,
  Face,
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

  async putSecret(tenant: TenantRef, ref: string, value: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO secrets (tenant_id, ref, value) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, ref) DO UPDATE SET value = EXCLUDED.value`,
      [tenantId(tenant), ref, value],
    );
  }

  async deleteSecret(tenant: TenantRef, ref: string): Promise<void> {
    await this.pool.query(`DELETE FROM secrets WHERE tenant_id = $1 AND ref = $2`, [
      tenantId(tenant),
      ref,
    ]);
  }

  private static faceOf(row: {
    id: string;
    install_id: string;
    channel_ref: string;
    name: string;
    avatar_url: string | null;
    secret_ref: string;
    origin: string;
  }): Face {
    return {
      id: row.id,
      installId: row.install_id,
      channelRef: row.channel_ref,
      name: row.name,
      avatarUrl: row.avatar_url,
      secretRef: row.secret_ref,
      origin: row.origin as Face['origin'],
    };
  }

  async createFace(tenant: TenantRef, input: CreateFaceInput): Promise<Face> {
    const { rows } = await this.pool.query(
      `INSERT INTO faces (tenant_id, install_id, channel_ref, name, avatar_url, secret_ref, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, install_id, channel_ref, name, avatar_url, secret_ref, origin`,
      [
        tenantId(tenant),
        input.installId,
        input.channelRef,
        input.name,
        input.avatarUrl ?? null,
        input.secretRef,
        input.origin,
      ],
    );
    return PgRepository.faceOf(rows[0]);
  }

  async listFaces(tenant: TenantRef, channelRef?: string): Promise<Face[]> {
    const { rows } = await this.pool.query(
      `SELECT id, install_id, channel_ref, name, avatar_url, secret_ref, origin
         FROM faces
        WHERE tenant_id = $1 AND ($2::text IS NULL OR channel_ref = $2)
        ORDER BY created_at`,
      [tenantId(tenant), channelRef ?? null],
    );
    return rows.map(PgRepository.faceOf);
  }

  async getFace(tenant: TenantRef, faceId: string): Promise<Face | null> {
    const { rows } = await this.pool.query(
      `SELECT id, install_id, channel_ref, name, avatar_url, secret_ref, origin
         FROM faces WHERE id = $1 AND tenant_id = $2`,
      [faceId, tenantId(tenant)],
    );
    return rows[0] ? PgRepository.faceOf(rows[0]) : null;
  }

  async renameFace(
    tenant: TenantRef,
    faceId: string,
    changes: { name?: string; avatarUrl?: string | null },
  ): Promise<void> {
    // COALESCE keeps a field untouched when the change omits it (undefined → null → keep).
    await this.pool.query(
      `UPDATE faces
          SET name = COALESCE($3, name),
              avatar_url = CASE WHEN $4::boolean THEN $5 ELSE avatar_url END
        WHERE id = $1 AND tenant_id = $2`,
      [
        faceId,
        tenantId(tenant),
        changes.name ?? null,
        changes.avatarUrl !== undefined,
        changes.avatarUrl ?? null,
      ],
    );
  }

  async deleteFace(
    tenant: TenantRef,
    faceId: string,
  ): Promise<{ wasLastInChannel: boolean } | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `DELETE FROM faces WHERE id = $1 AND tenant_id = $2
         RETURNING install_id, channel_ref`,
        [faceId, tenantId(tenant)],
      );
      if (rows.length === 0) {
        await client.query('COMMIT');
        return null;
      }
      const { rows: countRows } = await client.query(
        `SELECT count(*)::int AS n FROM faces
          WHERE tenant_id = $1 AND install_id = $2 AND channel_ref = $3`,
        [tenantId(tenant), rows[0].install_id, rows[0].channel_ref],
      );
      await client.query('COMMIT');
      return { wasLastInChannel: countRows[0].n === 0 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async countChannelFaces(
    tenant: TenantRef,
    installId: string,
    channelRef: string,
  ): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT count(*)::int AS n FROM faces
        WHERE tenant_id = $1 AND install_id = $2 AND channel_ref = $3`,
      [tenantId(tenant), installId, channelRef],
    );
    return rows[0].n;
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
       ON CONFLICT (spell_id, dedupe_key) WHERE outcome <> 'deduped' DO NOTHING`,
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

  async recordDeduped(tenant: TenantRef, input: RecordInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO records (tenant_id, spell_id, source, event_type, dedupe_key, outcome, settled_at)
       VALUES ($1, $2, $3, $4, $5, 'deduped', now())`,
      [tenantId(tenant), input.spellId, input.source, input.eventType, input.dedupeKey],
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
