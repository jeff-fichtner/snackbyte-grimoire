// @vitest-environment node
/**
 * The face noun's lifecycle, against the FakeRepository and a stub binding.
 *
 * The properties that matter: a channel's first face establishes ONE credential and the rest
 * reuse it; the credential is stored as a secret (never on the row); rename is a pure row
 * update (no platform call); deleting a channel's LAST face retires the credential ONLY if the
 * platform minted it, an earlier one does not; adopt stores the supplied credential and marks
 * origin.
 */
import { describe, expect, it } from 'vitest';
import { tenantFromVerifiedCall } from '../../src/core/law/tenant-ref.js';
import type { Binding } from '../../src/core/logistics/binding.js';
import { FakeRepository } from '../../src/db/fake-repository.js';
import {
  adoptFace,
  deleteFace,
  FaceConflict,
  listFaces,
  mintFace,
  NoSuchFace,
  renameFace,
  type FaceOpsDeps,
} from '../../src/core/nouns/faces.js';

const tenantA = tenantFromVerifiedCall({
  registrationId: 'r-a',
  tenantId: 'A',
  source: 'github',
  signatureVerified: true,
});

function harness() {
  const establishCalls: Array<{ channelRef: string; name: string }> = [];
  const retireCalls: string[] = [];
  const adoptCalls: string[] = [];
  let n = 0;
  const binding: Binding = {
    key: 'stub',
    send: async () => {},
    establishFace: async (_app, channelRef, name) => {
      establishCalls.push({ channelRef, name });
      return { credential: `wh://${channelRef}/${++n}` };
    },
    adoptFace: async (credential) => {
      adoptCalls.push(credential);
    },
    retireFace: async (credential) => {
      retireCalls.push(credential);
    },
  };
  const repo = new FakeRepository();
  const deps: FaceOpsDeps = { repo, binding, applicationId: 'app' };
  return { deps, repo, establishCalls, retireCalls, adoptCalls };
}

const input = (name: string) => ({ installId: 'i-1', channelRef: 'chan-1', name });

describe('the face noun', () => {
  it("mints the channel's first face, establishing exactly one credential", async () => {
    const h = harness();
    const face = await mintFace(h.deps, tenantA, input('GitHub'));
    expect(face.origin).toBe('minted');
    expect(h.establishCalls).toHaveLength(1);
    // the credential is a SECRET, resolved by the row's ref — not a field on the face
    expect(face).not.toHaveProperty('credential');
    expect(await h.repo.resolveSecret(tenantA, face.secretRef)).toBe('wh://chan-1/1');
  });

  it('a second face in the same channel REUSES the one credential', async () => {
    const h = harness();
    const a = await mintFace(h.deps, tenantA, input('GitHub'));
    const b = await mintFace(h.deps, tenantA, input('ClickUp'));
    expect(h.establishCalls, 'establish only once per channel').toHaveLength(1);
    expect(a.secretRef).toBe(b.secretRef);
    expect(await h.repo.countChannelFaces(tenantA, 'i-1', 'chan-1')).toBe(2);
  });

  it('a later face RECALLS the channel ref from a row rather than re-deriving it', async () => {
    const h = harness();
    // A channel established under some earlier ref format — the row is the only record of it.
    await h.repo.putSecret(tenantA, 'legacy-ref.chan-1', 'wh://legacy/9');
    await h.repo.createFace(tenantA, {
      installId: 'i-1',
      channelRef: 'chan-1',
      name: 'GitHub',
      avatarUrl: null,
      secretRef: 'legacy-ref.chan-1',
      origin: 'minted',
    });
    const next = await mintFace(h.deps, tenantA, input('ClickUp'));
    expect(next.secretRef, 'the ref a face holds is the ref its channel shares').toBe(
      'legacy-ref.chan-1',
    );
    expect(h.establishCalls, 'the channel already speaks — establish nothing').toHaveLength(0);
    expect(await h.repo.resolveSecret(tenantA, next.secretRef)).toBe('wh://legacy/9');
  });

  it('two installs of one tenant on the same channel ref keep separate credentials', async () => {
    const h = harness();
    const first = await mintFace(h.deps, tenantA, { ...input('GitHub'), installId: 'i-1' });
    const second = await mintFace(h.deps, tenantA, { ...input('GitHub'), installId: 'i-2' });
    // Distinct refs, so the second install cannot write over the first's credential.
    expect(second.secretRef).not.toBe(first.secretRef);
    expect(await h.repo.resolveSecret(tenantA, first.secretRef)).toBe('wh://chan-1/1');
    expect(await h.repo.resolveSecret(tenantA, second.secretRef)).toBe('wh://chan-1/2');
  });

  it('rename is a pure row update — no platform call', async () => {
    const h = harness();
    const face = await mintFace(h.deps, tenantA, input('GitHub'));
    await renameFace(h.deps, tenantA, face.id, { name: 'GitHub CI', avatarUrl: 'new.png' });
    const [after] = await listFaces(h.deps, tenantA, 'chan-1');
    expect(after.name).toBe('GitHub CI');
    expect(after.avatarUrl).toBe('new.png');
    expect(h.retireCalls, 'rename touches no webhook').toHaveLength(0);
  });

  it('deleting a NON-last face does not retire the credential', async () => {
    const h = harness();
    const a = await mintFace(h.deps, tenantA, input('GitHub'));
    await mintFace(h.deps, tenantA, input('ClickUp'));
    await deleteFace(h.deps, tenantA, a.id);
    expect(h.retireCalls, 'one face remains — keep the credential').toHaveLength(0);
    expect(await h.repo.resolveSecret(tenantA, a.secretRef)).not.toBeNull();
  });

  it('deleting the LAST MINTED face retires the credential and removes the secret', async () => {
    const h = harness();
    const a = await mintFace(h.deps, tenantA, input('GitHub'));
    await deleteFace(h.deps, tenantA, a.id);
    expect(h.retireCalls, 'last face gone — retire what we minted').toEqual(['wh://chan-1/1']);
    expect(await h.repo.resolveSecret(tenantA, a.secretRef)).toBeNull();
  });

  it('deleting the LAST ADOPTED face forgets the credential but does NOT destroy it', async () => {
    const h = harness();
    const face = await adoptFace(h.deps, tenantA, {
      ...input('miss honey'),
      suppliedCredential: 'wh://supplied/abc',
    });
    await deleteFace(h.deps, tenantA, face.id);
    // The community's own webhook predates us and may serve things we know nothing about.
    expect(h.retireCalls, 'never destroy an identity we did not establish').toHaveLength(0);
    // We can no longer speak through it, which is all FR-015 asks.
    expect(await h.repo.resolveSecret(tenantA, face.secretRef)).toBeNull();
    expect(await h.repo.listFaces(tenantA, 'chan-1')).toHaveLength(0);
  });

  it("renaming a face that is not this tenant's is REFUSED, not silently ignored", async () => {
    const h = harness();
    await expect(renameFace(h.deps, tenantA, 'no-such-id', { name: 'Nope' })).rejects.toThrow(
      NoSuchFace,
    );
  });

  it("deleting a face that is not this tenant's is REFUSED, not a quiet success", async () => {
    const h = harness();
    const face = await mintFace(h.deps, tenantA, input('GitHub'));
    await deleteFace(h.deps, tenantA, face.id);
    // Gone once is honest; gone twice is the caller believing something happened.
    await expect(deleteFace(h.deps, tenantA, face.id)).rejects.toThrow(NoSuchFace);
    expect(h.retireCalls, 'the second delete touches no platform').toHaveLength(1);
  });

  it('adopt accepts a supplied credential and marks origin', async () => {
    const h = harness();
    const face = await adoptFace(h.deps, tenantA, {
      ...input('miss honey'),
      suppliedCredential: 'wh://supplied/abc',
    });
    expect(face.origin).toBe('adopted');
    expect(h.adoptCalls).toEqual(['wh://supplied/abc']);
    expect(h.establishCalls, 'adopt establishes nothing').toHaveLength(0);
    expect(await h.repo.resolveSecret(tenantA, face.secretRef)).toBe('wh://supplied/abc');
  });

  it('adopt REFUSES a channel that already has a credential, rather than dropping it', async () => {
    const h = harness();
    const minted = await mintFace(h.deps, tenantA, input('GitHub'));
    await expect(
      adoptFace(h.deps, tenantA, {
        ...input('miss honey'),
        suppliedCredential: 'wh://supplied/abc',
      }),
    ).rejects.toThrow(FaceConflict);
    // Refused means refused: nothing validated, nothing written, the channel untouched.
    expect(h.adoptCalls, 'the supplied credential is not even reached for').toHaveLength(0);
    expect(await h.repo.listFaces(tenantA, 'chan-1')).toHaveLength(1);
    expect(await h.repo.resolveSecret(tenantA, minted.secretRef)).toBe('wh://chan-1/1');
  });
});
