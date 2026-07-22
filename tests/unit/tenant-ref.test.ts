// @vitest-environment node
/**
 * The tenant reference is the one guarantee everything else stands on, and most of it is
 * enforced by the compiler rather than at run time — so these tests assert the *type*
 * behaviour, using `// @ts-expect-error` as the assertion. A line that stops being an error
 * fails the typecheck, which means the guarantee has been weakened.
 *
 * What is being defended: `getSpells(session.tenant)` and `getSpells(req.body.tenant)` have
 * identical signatures and opposite security. A string cannot tell them apart.
 */
import { describe, expect, it } from 'vitest';
import { type TenantRef, tenantFromVerifiedCall, tenantId } from '../../src/core/law/tenant-ref.js';

describe('a tenant reference', () => {
  it('is minted from verified evidence and carries the id through', () => {
    const ref = tenantFromVerifiedCall({
      registrationId: 'reg-1',
      tenantId: 'tenant-a',
      source: 'github',
      signatureVerified: true,
    });
    expect(tenantId(ref)).toBe('tenant-a');
  });

  it('cannot be built from a bare string', () => {
    // @ts-expect-error a string is not a TenantRef, and no function turns one into it
    const forged: TenantRef = 'tenant-a';
    expect(forged).toBeDefined();
  });

  it('cannot be built from a request-shaped object', () => {
    // @ts-expect-error an object with the right id is still missing the unexported brand
    const forged: TenantRef = { id: 'tenant-a' };
    expect(forged).toBeDefined();
  });

  it('cannot be minted from evidence that merely claims verification', () => {
    const claimed = { registrationId: 'r', tenantId: 'tenant-b', source: 'github' };
    // @ts-expect-error signatureVerified: true is required and is a literal type
    const ref = tenantFromVerifiedCall(claimed);
    expect(ref).toBeDefined();
  });

  it('only travels one way — an id comes out, nothing turns one back into a reference', () => {
    const ref = tenantFromVerifiedCall({
      registrationId: 'reg-1',
      tenantId: 'tenant-a',
      source: 'github',
      signatureVerified: true,
    });
    const id: string = tenantId(ref);
    // @ts-expect-error the reverse does not typecheck: no constructor accepts an id
    const back: TenantRef = id;
    expect(back).toBe('tenant-a');
  });
});
