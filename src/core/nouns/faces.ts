/**
 * Faces — the noun. Community-owned personas a spell speaks through.
 *
 * A face is a row; a channel's faces share ONE webhook credential, established with the first
 * face and retired with the last (reference-counted here). The credential is a secret reached
 * only by reference — it never appears in a row or a return value.
 *
 * Two ways to establish that credential: MINT (the default — the platform creates the webhook,
 * which proves its authority) and ADOPT (explicit, more-privileged — accept a supplied
 * credential). Renaming is a pure row update, because the name and avatar are applied
 * per-message at delivery, so the next message wears the change with no platform call.
 *
 * Every operation takes a `TenantRef`; there is no unscoped face.
 */
import type { TenantRef } from '../law/tenant-ref.js';
import type { Binding } from '../logistics/binding.js';
import type { Face, Repository } from '../../db/repository.js';

export interface FaceOpsDeps {
  repo: Repository;
  binding: Binding;
  applicationId: string;
}

export interface FaceInput {
  installId: string;
  channelRef: string;
  name: string;
  avatarUrl?: string | null;
}

/** Raised when an operation cannot be honoured as asked — refused loudly, never substituted. */
export class FaceConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FaceConflict';
  }
}

/** Raised when a face the caller named is not this tenant's to operate on. */
export class NoSuchFace extends Error {
  constructor(faceId: string) {
    super(`no face ${faceId} for this tenant`);
    this.name = 'NoSuchFace';
  }
}

/**
 * Where a NEW channel's shared credential lives. The install is part of the ref because a ref is
 * unique only within a tenant, and one tenant may hold more than one install — two installs that
 * ever named the same channel would otherwise write over each other's credential.
 *
 * Only ever used for a channel that has no faces yet. An established channel's ref is READ off
 * its existing rows (see `channelCredential`), never recomputed — so this format can change
 * without stranding a single row, and the ref a face holds is the ref its channel shares.
 */
function newChannelCredentialRef(installId: string, channelRef: string): string {
  return `face-webhook.${installId}.${channelRef}`;
}

/**
 * The ref a channel's faces share, and whether the credential behind it already exists.
 *
 * Reading the ref from an existing row rather than deriving it twice is what keeps the two in
 * step: there is exactly one place a ref is invented (a channel's first face) and one place it
 * is recalled (every face after it).
 */
async function channelCredential(
  deps: FaceOpsDeps,
  tenant: TenantRef,
  installId: string,
  channelRef: string,
): Promise<{ ref: string; established: boolean }> {
  const inChannel = (await deps.repo.listFaces(tenant, channelRef)).filter(
    (face) => face.installId === installId,
  );
  const held = inChannel[0];
  return held
    ? { ref: held.secretRef, established: true }
    : { ref: newChannelCredentialRef(installId, channelRef), established: false };
}

/**
 * Ensure the channel has a credential, establishing one via `produce` only if it has no faces
 * yet. Returns the ref every face in the channel shares.
 */
async function ensureCredential(
  deps: FaceOpsDeps,
  tenant: TenantRef,
  installId: string,
  channelRef: string,
  produce: () => Promise<string>,
): Promise<string> {
  const { ref, established } = await channelCredential(deps, tenant, installId, channelRef);
  if (!established) {
    const credential = await produce();
    await deps.repo.putSecret(tenant, ref, credential);
  }
  return ref;
}

/** MINT — the default, safe path. Establishes the channel credential if new, then the face. */
export async function mintFace(
  deps: FaceOpsDeps,
  tenant: TenantRef,
  input: FaceInput,
): Promise<Face> {
  const secretRef = await ensureCredential(
    deps,
    tenant,
    input.installId,
    input.channelRef,
    async () => {
      const { credential } = await deps.binding.establishFace(
        deps.applicationId,
        input.channelRef,
        input.name,
      );
      return credential;
    },
  );
  return deps.repo.createFace(tenant, {
    installId: input.installId,
    channelRef: input.channelRef,
    name: input.name,
    avatarUrl: input.avatarUrl ?? null,
    secretRef,
    origin: 'minted',
  });
}

/**
 * ADOPT — the explicit, more-privileged path. Accepts a supplied credential rather than
 * establishing one. Never the default: the caller passes the supplied credential on purpose.
 *
 * Adoption is the FIRST act in a channel or none at all. A channel holds exactly one credential,
 * so adopting into a channel that already has faces has nowhere to put the supplied one — and
 * the two silent answers are both wrong: dropping it returns a row whose `origin` lies about the
 * credential beneath it, and re-pointing the channel would move every existing face onto a
 * webhook its owner never chose. So it refuses, and says what to do instead. Nothing is lost by
 * refusing: a persona is a name and an avatar applied per message, so minting a face with the
 * same name and avatar produces an identical message.
 */
export async function adoptFace(
  deps: FaceOpsDeps,
  tenant: TenantRef,
  input: FaceInput & { suppliedCredential: string },
): Promise<Face> {
  const { established } = await channelCredential(deps, tenant, input.installId, input.channelRef);
  if (established) {
    throw new FaceConflict(
      `channel ${input.channelRef} already speaks through an established credential — ` +
        `mint a face named "${input.name}" instead, or delete the channel's faces first`,
    );
  }
  const secretRef = await ensureCredential(
    deps,
    tenant,
    input.installId,
    input.channelRef,
    async () => {
      await deps.binding.adoptFace(input.suppliedCredential);
      return input.suppliedCredential;
    },
  );
  return deps.repo.createFace(tenant, {
    installId: input.installId,
    channelRef: input.channelRef,
    name: input.name,
    avatarUrl: input.avatarUrl ?? null,
    secretRef,
    origin: 'adopted',
  });
}

/** List a tenant's faces — a store read. Never returns a credential (FR-013). */
export async function listFaces(
  deps: FaceOpsDeps,
  tenant: TenantRef,
  channelRef?: string,
): Promise<Face[]> {
  return deps.repo.listFaces(tenant, channelRef);
}

/**
 * Rename / re-avatar — a pure row update; the next message wears the change (FR-014).
 *
 * Naming a face this tenant does not own matches nothing, and that must be heard: a silent
 * success would let a caller believe it had renamed something. The face is unchanged either way
 * (FR-007) — this only decides whether the caller is told.
 */
export async function renameFace(
  deps: FaceOpsDeps,
  tenant: TenantRef,
  faceId: string,
  changes: { name?: string; avatarUrl?: string | null },
): Promise<void> {
  const renamed = await deps.repo.renameFace(tenant, faceId, changes);
  if (!renamed) throw new NoSuchFace(faceId);
}

/**
 * DELETE — revoke. Forgets the channel credential when the last face goes (FR-015/016).
 *
 * Retiring the credential on the platform is reserved for what the platform MINTED. An adopted
 * credential is the community's own — it existed before us and may serve things we know nothing
 * about, so revoking our use of it must not destroy it. FR-015 asks only that the platform can
 * no longer speak through the face, and dropping the secret achieves that for both origins.
 *
 * This reads the deleted face's own `origin`, which is sound because a channel's faces share one
 * credential and therefore one origin. If a mixed-origin channel ever became possible, the error
 * here leans the safe way: an unretired minted webhook is a leak, not a destroyed identity.
 */
export async function deleteFace(
  deps: FaceOpsDeps,
  tenant: TenantRef,
  faceId: string,
): Promise<void> {
  const face = await deps.repo.getFace(tenant, faceId);
  // Deleting what is not there is not a quiet success — the caller named a face and there isn't
  // one, which is worth hearing whether it was never ours or is already gone.
  if (!face) throw new NoSuchFace(faceId);
  const result = await deps.repo.deleteFace(tenant, faceId);
  if (result?.wasLastInChannel) {
    if (face.origin === 'minted') {
      const credential = await deps.repo.resolveSecret(tenant, face.secretRef);
      if (credential) await deps.binding.retireFace(credential);
    }
    await deps.repo.deleteSecret(tenant, face.secretRef);
  }
}
