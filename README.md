# Grimoire

**Spells for your community.** Grimoire is a platform where chat communities own
_spells_ — stored sentences that do things when spoken: post as a persona, grant a role,
welcome a member, relay an event from the outside world. Spells are composed without code,
cast with verified authority, and delivered with guarantees.

- **The book:** [GRIMOIRE.md](GRIMOIRE.md) — the founding design element: the concept
  (performative speech), the structure (language · law · logistics over spells · nouns),
  and the lexicon.
- **The law of the repo:** [.specify/memory/constitution.md](.specify/memory/constitution.md).

## Status

Founding stage. The concept and constitution land first; the spec series and code follow.
**Discord is the first binding**, and the architecture intends a handful of further
platforms (Slack among them) if wanted — nothing in the core names a platform.

Grimoire is built on a complete working predecessor (`snackbyte-discord`, private): a
Discord integration hub that served as the proof of concept. This repository starts fresh
from its lessons — greenfield code, spec-driven from the first commit.

## Development

Spec-driven via GitHub Spec Kit: constitution → specify → plan → tasks → implement, one
feature per `spec/NNN-*` branch, quality gates green on every change. The toolchain will be
pinned (TypeScript, Node) as the first code lands.

---

A [snackbyte](https://snackbyte.io) project.
