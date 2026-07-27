/**
 * The walk: trigger → law admits → spell → logic → verb → nouns → logistics performs.
 *
 * Every feature in this system is this same trip, differing only in which stations do
 * non-trivial work. Reading this file should tell you the shape of the whole product.
 */
import type { CanonicalEvent } from './language/event.js';
import { InvalidRule, evaluate, parsePredicate } from './language/logic/index.js';
import { getVerb } from './language/verbs/index.js';
import type { TenantRef } from './law/tenant-ref.js';
import { type DeliverDeps, type DeliveryResult, deliver } from './logistics/deliver.js';
import { childLog } from './log.js';
import type { Repository } from '../db/repository.js';

const log = childLog('invocation');

export interface InvocationOutcome {
  matched: number;
  delivered: number;
  deduped: number;
  declined: number;
  failed: number;
}

export interface InvokeDeps extends DeliverDeps {
  repo: Repository;
}

/**
 * Run every spell of this tenant that matches the event.
 *
 * Spells are read live, so an owner's edit takes effect on the next event with no restart.
 * Each is handled independently and its failure is contained: one spell that cannot deliver
 * must never prevent another's message.
 */
export async function invoke(
  deps: InvokeDeps,
  tenant: TenantRef,
  event: CanonicalEvent,
): Promise<InvocationOutcome> {
  const spells = await deps.repo.findSpells(tenant, event.source, event.eventType);
  const outcome: InvocationOutcome = {
    matched: spells.length,
    delivered: 0,
    deduped: 0,
    declined: 0,
    failed: 0,
  };

  await Promise.all(
    spells.map(async (spell) => {
      const record = {
        spellId: spell.id,
        source: event.source,
        eventType: event.eventType,
        dedupeKey: event.dedupeKey,
      };

      try {
        // Logic: whether this spell speaks at all. A decline is the system working, and is
        // recorded distinctly from a failure.
        const predicate = parsePredicate(spell.condition);
        if (!evaluate(predicate, event)) {
          const claim = await deps.repo.beginRecord(tenant, record);
          if (claim === 'duplicate') {
            outcome.deduped++;
            return;
          }
          await deps.repo.settleRecord(tenant, claim, 'declined');
          outcome.declined++;
          return;
        }

        const verb = getVerb(spell.verb);
        if (!verb) throw new InvalidRule(`unknown verb "${spell.verb}"`);

        // The verb speaks through the chokepoint and never learns how delivery went — that
        // knowledge belongs to logistics.
        // Held in an object rather than a `let`: control-flow analysis cannot see the
        // assignment inside the speak() callback, and would otherwise narrow the variable
        // to its initializer and call every comparison below unreachable.
        const outcomeOf: { value: DeliveryResult } = { value: 'failed' };
        await verb.perform(
          {
            event,
            speak: async (destinationId, content) => {
              const destination = await deps.repo.getDestination(tenant, destinationId);
              if (!destination) throw new Error(`no destination ${destinationId}`);
              outcomeOf.value = await deliver(
                deps,
                tenant,
                record,
                destination.channelRef,
                content,
              );
            },
            speakThroughFace: async (faceId, content) => {
              const face = await deps.repo.getFace(tenant, faceId);
              if (!face) throw new Error(`no face ${faceId}`);
              // The credential is resolved here, at the last moment, and travels no further
              // than the message. A deleted face's credential is gone, so this throws and the
              // invocation is recorded failed — never delivered.
              const credential = await deps.repo.resolveSecret(tenant, face.secretRef);
              if (!credential) throw new Error(`face ${faceId} has no credential`);
              outcomeOf.value = await deliver(deps, tenant, record, face.channelRef, content, {
                credential,
                username: face.name,
                avatarUrl: face.avatarUrl ?? undefined,
              });
            },
            // A webhook owes no reply. A `needsReturnChannel` verb has no business on this path
            // and cannot reach a real return channel here, so it fails loudly rather than
            // pretending to answer someone who never asked.
            reply: async () => {
              throw new Error('this trigger species owes no reply');
            },
          },
          verb.parse(spell.verbConfig) as never,
        );

        if (outcomeOf.value === 'delivered') outcome.delivered++;
        else if (outcomeOf.value === 'deduped') outcome.deduped++;
        else outcome.failed++;
      } catch (error) {
        // Contained: this spell failed, the others still run.
        outcome.failed++;
        const detail = error instanceof Error ? error.message : String(error);
        log.warn({ spell: spell.id, err: detail }, 'spell failed');
        const claim = await deps.repo.beginRecord(tenant, record).catch(() => 'duplicate' as const);
        if (claim !== 'duplicate') {
          await deps.repo.settleRecord(tenant, claim, 'failed', detail).catch(() => undefined);
        }
      }
    }),
  );

  return outcome;
}

/**
 * The invocation walk for a command: the same stations as `invoke` — spell match, logic, verb —
 * but the logistics station is a REPLY, captured and returned for the synchronous interaction
 * response rather than delivered to a channel through the async chokepoint.
 *
 * The first matching, non-declined spell answers; its content is returned. A command whose verb
 * owes no reply is a misconfiguration and fails loudly rather than pretending to answer. Returns
 * null when nothing matched or every match declined — the caller decides what the invoker sees.
 */
export async function handleCommand(
  repo: Repository,
  tenant: TenantRef,
  event: CanonicalEvent,
): Promise<string | null> {
  const spells = await repo.findSpells(tenant, event.source, event.eventType);
  for (const spell of spells) {
    const predicate = parsePredicate(spell.condition);
    if (!evaluate(predicate, event)) continue; // a decline — try the next matching spell, if any

    const verb = getVerb(spell.verb);
    if (!verb) throw new InvalidRule(`unknown verb "${spell.verb}"`);
    if (!verb.needsReturnChannel) {
      throw new InvalidRule(`verb "${spell.verb}" cannot answer a command — it owes no reply`);
    }

    // Held in an object so control-flow analysis cannot narrow it to its initializer across the
    // callback (the same reason `invoke` does it above).
    const captured: { value: string | null } = { value: null };
    await verb.perform(
      {
        event,
        speak: async () => {
          throw new Error('a command verb replies; it does not speak outward');
        },
        speakThroughFace: async () => {
          throw new Error('a command verb replies; it does not speak through a face');
        },
        reply: async (content) => {
          captured.value = content;
        },
      },
      verb.parse(spell.verbConfig) as never,
    );
    return captured.value;
  }
  return null;
}
