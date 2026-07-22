/**
 * Admission: is this call genuine, and whose is it?
 *
 * Two properties matter more than the happy path.
 *
 * 1. Verification happens over the EXACT received bytes, before anything is parsed.
 * 2. An unknown registration and a forged signature are indistinguishable — same answer,
 *    same work, same time. An early return on unknown-selector is measurably faster than the
 *    HMAC path, and that difference is a tenant-enumeration oracle: a prober learns which
 *    install identifiers exist. So the unknown branch verifies against a decoy secret of the
 *    same length and discards the result.
 */
import { timingSafeEqual } from 'node:crypto';
import type { Repository } from '../../db/repository.js';
import { getSource } from '../../sources/types.js';
import { type TenantRef, tenantFromVerifiedCall } from './tenant-ref.js';

/** A decoy of realistic length, so the rejected path does the same work as the real one. */
const DECOY_SECRET = 'x'.repeat(40);
/** A well-formed id that owns nothing, so the decoy lookup costs what a real one costs. */
const DECOY_ID = '00000000-0000-0000-0000-000000000000';
const DECOY_REF = 'decoy.signing';

export type Admission =
  | { admitted: true; tenant: TenantRef; source: string }
  /** Deliberately carries no reason. The caller cannot leak what it does not know. */
  | { admitted: false; reason: 'unauthorized' }
  /** The store could not answer. Distinct because the source should retry, not give up. */
  | { admitted: false; reason: 'unavailable' };

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual requires equal lengths; comparing lengths first leaks only length,
  // which the header format already fixes.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function authenticate(
  repo: Repository,
  registrationId: string,
  body: Buffer,
  headers: Readonly<Record<string, string | undefined>>,
): Promise<Admission> {
  let registration;
  try {
    registration = await repo.findRegistration(registrationId);
  } catch {
    return { admitted: false, reason: 'unavailable' };
  }

  // Resolve the adapter from the registration when we have one, and fall back to a known
  // adapter otherwise purely so the decoy path reads the same header and does the same work.
  const adapter = getSource(registration?.source ?? 'github');
  if (!adapter) return { admitted: false, reason: 'unauthorized' };

  const presented = headers[adapter.signatureHeader] ?? '';

  // Look the secret up on BOTH paths, including the unknown one.
  //
  // This looks wasteful and is not. Skipping the lookup when the registration is unknown
  // costs one fewer database round trip, and over a network that is a plainly measurable
  // difference — an attacker times two requests and learns which install identifiers exist.
  // It is invisible against a local database and obvious against a hosted one, which is
  // exactly why it survived until the suite ran against real infrastructure.
  //
  // The decoy tenant is never returned and its result is discarded; the point is that the
  // work happens either way.
  const lookupTenant = tenantFromVerifiedCall(
    registration
      ? {
          registrationId: registration.id,
          tenantId: registration.tenantId,
          source: registration.source,
          signatureVerified: true,
        }
      : {
          registrationId: DECOY_ID,
          tenantId: DECOY_ID,
          source: 'github',
          signatureVerified: true,
        },
  );

  let secret: string | null;
  try {
    secret = await repo.resolveSecret(lookupTenant, registration?.secretRef ?? DECOY_REF);
  } catch {
    return { admitted: false, reason: 'unavailable' };
  }

  // The decisive line: compute an HMAC either way. When the registration is unknown (or its
  // secret is missing) this is against a decoy and the result is thrown away — but the work
  // is done, so the two branches cost the same.
  const expected = adapter.sign(body, secret ?? DECOY_SECRET);
  const matches = constantTimeEquals(presented, expected);

  if (!registration || !secret || !matches) {
    return { admitted: false, reason: 'unauthorized' };
  }

  return {
    admitted: true,
    source: registration.source,
    tenant: tenantFromVerifiedCall({
      registrationId: registration.id,
      tenantId: registration.tenantId,
      source: registration.source,
      signatureVerified: true,
    }),
  };
}
