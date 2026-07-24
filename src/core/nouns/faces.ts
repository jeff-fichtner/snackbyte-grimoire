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

/** Where a channel's shared webhook credential lives — one ref per channel. */
function channelCredentialRef(channelRef: string): string {
  return `face-webhook.${channelRef}`;
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
  const ref = channelCredentialRef(channelRef);
  const count = await deps.repo.countChannelFaces(tenant, installId, channelRef);
  if (count === 0) {
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
 */
export async function adoptFace(
  deps: FaceOpsDeps,
  tenant: TenantRef,
  input: FaceInput & { suppliedCredential: string },
): Promise<Face> {
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

/** Rename / re-avatar — a pure row update; the next message wears the change (FR-014). */
export async function renameFace(
  deps: FaceOpsDeps,
  tenant: TenantRef,
  faceId: string,
  changes: { name?: string; avatarUrl?: string | null },
): Promise<void> {
  await deps.repo.renameFace(tenant, faceId, changes);
}

/** DELETE — revoke. Retires the channel credential when the last face goes (FR-015/016). */
export async function deleteFace(
  deps: FaceOpsDeps,
  tenant: TenantRef,
  faceId: string,
): Promise<void> {
  const face = await deps.repo.getFace(tenant, faceId);
  if (!face) return;
  const result = await deps.repo.deleteFace(tenant, faceId);
  if (result?.wasLastInChannel) {
    const credential = await deps.repo.resolveSecret(tenant, face.secretRef);
    if (credential) await deps.binding.retireFace(credential);
    await deps.repo.deleteSecret(tenant, face.secretRef);
  }
}
