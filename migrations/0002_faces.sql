-- 0002 — Faces: community-owned personas a spell speaks through.
--
-- A face is a NOUN — a row. All of a channel's faces share ONE per-channel webhook whose URL
-- is a credential held in `secrets` and reached only by reference. There is deliberately NO
-- `webhook_url` column: Constitution VII names a capability URL "a credential in the strongest
-- sense … never an address", so it lives in the secret store like every other credential, and
-- `secret_ref` points at it. The credential is established with a channel's first face and
-- retired with its last (reference-counted by the rows here).
--
-- `origin` records how the credential was obtained ('minted' — the platform established it,
-- proving its authority; 'adopted' — a supplied credential was accepted) so authorization
-- provenance is auditable (Constitution VIII: "the platform minted this credential").

CREATE TABLE faces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants (id),
  install_id  uuid NOT NULL REFERENCES installs (id),
  channel_ref text NOT NULL,
  name        text NOT NULL,
  avatar_url  text,
  secret_ref  text NOT NULL,
  origin      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- A persona name is unique within a channel; two faces may share a channel (and its one
  -- credential) but not a name.
  UNIQUE (tenant_id, install_id, channel_ref, name)
);

CREATE INDEX faces_by_channel ON faces (tenant_id, install_id, channel_ref);
