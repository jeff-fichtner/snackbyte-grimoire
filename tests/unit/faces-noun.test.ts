// @vitest-environment node
/**
 * The face noun's lifecycle, against the FakeRepository and a stub binding.
 *
 * The properties that matter: a channel's first face establishes ONE credential and the rest
 * reuse it; the credential is stored as a secret (never on the row); rename is a pure row
 * update (no platform call); deleting a channel's LAST face retires the credential, an earlier
 * one does not; adopt stores the supplied credential and marks origin.
 */
import { describe, expect, it } from 'vitest';
import { tenantFromVerifiedCall } from '../../src/core/law/tenant-ref.js';
import type { Binding } from '../../src/core/logistics/binding.js';
import { FakeRepository } from '../../src/db/fake-repository.js';
import {
  adoptFace,
  deleteFace,
  listFaces,
  mintFace,
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

  it('deleting the LAST face retires the credential and removes the secret', async () => {
    const h = harness();
    const a = await mintFace(h.deps, tenantA, input('GitHub'));
    await deleteFace(h.deps, tenantA, a.id);
    expect(h.retireCalls, 'last face gone — retire').toEqual(['wh://chan-1/1']);
    expect(await h.repo.resolveSecret(tenantA, a.secretRef)).toBeNull();
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
});
