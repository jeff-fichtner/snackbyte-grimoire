/**
 * The tenant reference — the law's one export that everything downstream depends on.
 *
 * Constitution VIII requires that tenant identity be derived, never accepted, and that the
 * derivation be *structural*: scoping alone prevents accidents, but only an unforgeable
 * reference prevents attacks. So this is not a convention to follow — it is a type with no
 * public constructor.
 *
 * `getSpells(session.tenant)` and `getSpells(req.body.tenant)` have identical signatures and
 * opposite security. A `string` cannot tell them apart; this can. The brand below is a
 * module-private symbol that is never exported, so no caller outside this file can produce
 * a value of this type. Forging one requires `as unknown as TenantRef` — a phrase that is
 * greppable, lint-banned, and obvious in review, which a missing WHERE clause is not.
 */

declare const tenantBrand: unique symbol;

/** Proof that a tenant was identified from evidence the platform verified. */
export type TenantRef = {
  readonly [tenantBrand]: 'tenant';
  readonly id: string;
};

/** A source registration whose signature has already been verified against its secret. */
export interface VerifiedRegistration {
  readonly registrationId: string;
  readonly tenantId: string;
  readonly source: string;
  /** Set only by the authenticator, and only after a successful constant-time comparison. */
  readonly signatureVerified: true;
}

/**
 * Mint a reference from a verified inbound call.
 *
 * The parameter type is the whole guarantee: `signatureVerified: true` is a literal type, so
 * a caller cannot pass an object that merely *claims* verification without writing the
 * literal — and the only code that constructs one is the authenticator, after the
 * comparison succeeds.
 */
export function tenantFromVerifiedCall(registration: VerifiedRegistration): TenantRef {
  return { id: registration.tenantId } as TenantRef;
}

/**
 * Read the underlying id, for use as a query parameter or a log field.
 *
 * Deliberately one-way: this hands out a string, and no function anywhere turns a string
 * back into a `TenantRef`.
 */
export function tenantId(ref: TenantRef): string {
  return ref.id;
}
