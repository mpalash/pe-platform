# Platform Build Plan

**An experimental, artistic web platform** — a public video archive, richly structured
editorial pages, magic-link accounts, and slot booking.

This is a **greenfield build in a new repository**. Nothing is migrated. Only the video archive
player and browser are ported from an existing implementation — functionality only, with all
styling rebuilt.

These files are the complete plan: architecture decisions, repository conventions, and seven
phases. Written to be handed to a developer, or read a phase at a time by a Claude Code
session.

---

## Contents

| File | What it is |
|---|---|
| **[00-OVERVIEW.md](00-OVERVIEW.md)** | Start here. Stack, dependency budget, five ADRs, phase map, cross-cutting rules, open questions. |
| **[CLAUDE.md](CLAUDE.md)** | Copy to the repo root. Thirteen hard rules for the coding agent. |
| [01-phase-1-foundation.md](01-phase-1-foundation.md) | New repo, `docker compose up` with Directus + Postgres + Mailpit, and the **magic-link spike**. |
| [02-phase-2-design-system.md](02-phase-2-design-system.md) | Tokens and layout primitives, hand-written. No framework. |
| [03-phase-3-archive.md](03-phase-3-archive.md) | Port the player, serve public MP4 via CloudFront, build the seam for HLS later. |
| [04-phase-4-content-model.md](04-phase-4-content-model.md) | Pages, blocks, Live Preview. A design exercise conducted in a CMS. |
| [05-phase-5-auth-magic-link.md](05-phase-5-auth-magic-link.md) | Passwordless sign-in, owned by Nitro. Testable entirely on localhost. |
| [06-phase-6-booking.md](06-phase-6-booking.md) | Slots and claims. Mostly about not double-booking. |
| [07-phase-7-production.md](07-phase-7-production.md) | Deploy, SES, hardening, editor onboarding, launch checklist. |

Phases 3 and 4 are independent and can run in parallel.

---

## How to use this

**Set-up.** Split this document back out into the phase sections if you like — the phases are written
to be read one at a time — and extract the [CLAUDE.md](#claudemd) section to the repository
root, where a coding agent will find it automatically.

**Per phase.** Each phase follows the same shape: goal → preconditions → numbered steps →
**acceptance criteria** → **guardrails** → things to record before closing.

The guardrails list what is deliberately out of scope for that phase. They matter more than
they look: phases are ordered by risk, and scope bleeding across boundaries is the usual way a
build like this loses its shape.

---

## The one real technical risk

**Directus has no native magic-link authentication.** It is a
[long-standing open request](https://github.com/directus/directus/discussions/17888) with only
an unmaintained community extension available. ADR-002 therefore puts the session in Nuxt's
server layer and keeps Directus as the user store — roughly 150 lines we own, for a gated
surface of three endpoints.

**Phase 1 includes a one-day spike to prove that shape works before Phase 5 commits to it.**
Social sign-in was considered as a fallback and ruled out: it costs an external identity
provider and excludes anyone without a Google or Facebook account from booking a place at an
event. If the spike fails, that is an escalation to a human, not a silent substitution.

---

## Why this is smaller than it looks

The settled requirements removed a great deal:

| Not building | Because |
|---|---|
| Signed cookies, media gating | Archive is public |
| HLS transcode pipeline | MP4 served directly; a seam makes the later swap per-item |
| Row-locking transactions | Capacity-1 slots → a unique index is the whole mechanism |
| Any scheduled job | No holds; "expired" is a query filter |
| Recurrence engine | Slots are hand-entered or imported from a file |
| Migration, cutover, rollback | Greenfield |
| Passwords, social login | Magic link only |
| Kiosk mode | Deferred |

The two genuinely hard things left are **the content model** and **magic-link auth**.

---

## Do this week, before any code

1. **File the AWS SES production access request.** Multi-day approval. Magic link means email
   *is* the login path — a deployed environment without it is one nobody can sign into.
2. **Answer Q1** — the venue's IANA timezone. Blocks Phase 6, and it is what the slot importer
   converts against.
3. **Check the archive files for faststart** — whether the `moov` atom sits before `mdat`. Any
   file where it does not will appear broken to visitors, and the fix is a seconds-long remux.
   Phase 3 §3.4 has the commands.
