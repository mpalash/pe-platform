# CLAUDE.md

Conventions and guardrails for this repository. Read before doing anything.

## What this is

A greenfield, experimental, artistic web platform: a **public** video archive player and
browser, richly structured editorial pages, magic-link accounts, and a slot-booking system.

Architecture decisions and rationale: `00-OVERVIEW.md`. **Read it before proposing
anything structural.** Phase plans: `docs/plan/0N-*.md`.

Only the archive player/browser is ported from an earlier implementation. Everything else,
including all styling and layout, is written from scratch here.

## Stack

- **Frontend:** Nuxt 4 (Vue 3), TypeScript, Nitro server routes
- **Backend:** Directus on Postgres — content, user store, slots, bookings
- **Session:** owned by Nitro, not Directus (see ADR-002)
- **Media:** AWS S3 → CloudFront, public MP4 (HLS deferred — see ADR-004)
- **Email:** Mailpit locally, AWS SES deployed

## Commands

<!-- Keep accurate as the repo grows. -->

```bash
docker compose up          # Postgres + Directus + Mailpit
pnpm dev                   # Nuxt dev server
pnpm build
pnpm typecheck             # vue-tsc
pnpm lint
pnpm test                  # vitest
pnpm test:booking          # concurrency suite — must pass before any booking change ships
pnpm directus:snapshot     # export Directus schema to directus/migrations/
pnpm directus:apply        # apply committed schema to local Directus
```

Mailpit web UI: http://localhost:8025 — this is where sign-in links arrive in development.

## Layout

```
app/
  assets/styles/       # design tokens, resets, primitives — hand-written
  components/
    blocks/            # one per content block type, name-matched to Directus collections
    archive/           # ported player + browser
    ui/                # design-system primitives
  composables/
  layouts/
  pages/
server/
  api/
    auth/              # magic-link request + verify, session
    booking/           # claim, cancel, list
  utils/               # directus client (service token), session helpers
directus/
  extensions/
  migrations/          # committed schema snapshots
scripts/
  import-slots.ts      # CSV/JSON bulk slot import
  media/               # faststart checks/remux; HLS ladder when that day comes
docs/plan/
```

## Hard rules

1. **No new external service or SaaS dependency** without first adding an ADR to
   `00-OVERVIEW.md`. The dependency budget there is the complete allowed list.

2. **Everything runs on localhost.** `docker compose up` plus `pnpm dev` is the entire setup.
   The full sign-in flow must work with no cloud account and no vendor network access —
   Mailpit catches the magic link. **A feature that cannot be exercised locally is not done.**

3. **Never serve video directly from S3.** Egress is $0.09/GB. Everything goes through
   CloudFront. An `s3.amazonaws.com` URL reaching a player is a bug.

4. **The archive is public.** No signed URLs, no signed cookies, no gating on media. If you
   find yourself adding auth to a video request, stop — that is not this platform.

5. **Never reference a container format outside `usePlaybackSource`.** Media is MP4 today and
   HLS later; the composable is the seam that makes that a one-place change. A `.mp4` literal
   in a component is a bug.

6. **Session identity is read server-side, from the session cookie. Never from a request
   body.** A `user_id` in a payload is ignored.

7. **Booking concurrency is the database's job.** A partial unique index on
   `bookings (slot) WHERE status = 'confirmed'` is the whole mechanism. Never check
   availability in application code and then write — that is a race condition.

8. **Directus Flows are not a job queue.** No retry, no dead-letter. Anything that must not be
   silently lost writes to a log collection.

9. **Magic-link email is load-bearing for sign-in.** A silent send failure means a user who
   cannot log in and cannot tell you. Log every send; surface failures.

10. **Times are authored venue-local; an explicit UTC offset overrides.** A time written
    without an offset means venue-local. A time written with one (`+02:00`, `Z`) is taken as
    given. Both resolve to a `timestamptz` instant on write, and the authored zone is stored
    alongside it. **A naive local time in the DST fall-back hour is ambiguous — reject it and
    require an explicit offset.** Any date test includes both DST boundaries.

11. **Keyboard operability is a baseline.** Every interactive element reachable and operable
    by keyboard, with a visible focus state. Not a Phase 7 cleanup task.

12. **Schema changes are committed.** Snapshot Directus after clicking anything into the
    admin, and commit it alongside the code that depends on it.

13. **Do not cross phase boundaries.** Each phase doc has a Guardrails section. Phases are
    ordered by risk; skipping ahead defeats the ordering.

## Style

- Composition API, `<script setup>`, TypeScript throughout.
- **Styling is hand-written from design tokens.** No CSS framework, no component library, no
  ported stylesheets. See `docs/plan/02-phase-2-design-system.md`.
- Content block components are dumb and presentational. A block that fetches its own data is
  a bug — shaping happens in composables.
- Anything involving a secret, a session, or an authorization decision goes through a Nitro
  server route, never a client-side call to Directus.
- The Directus service token is server-only. It must never reach the browser bundle.

## When unsure

Check `00-OVERVIEW.md` §7 (Open Questions). If your question is there, it is a
decision for a human — stop and ask rather than picking a default.
