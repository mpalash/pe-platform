# Platform Build — Overview & Architecture Decisions

> **This is a greenfield build in a new repository.** Nothing is being migrated.
> The only code carried over is the video archive player/browser. Everything else —
> styling, layout, content model, auth, booking — is written from scratch.
>
> **Status:** plan of record.

---

## 1. What we are building

An experimental, artistic web platform:

| Capability | Source | Notes |
|---|---|---|
| **Video archive** player + browser | **Ported** from the existing Vue implementation | Functionality only. Restyled from scratch. Served as **MP4 for now**; HLS deferred. |
| **Content pages** — rich, structured, hierarchical | New | Block-based. Non-technical editors join once the content design settles. |
| **Auth** — magic link, no passwords | New | Must be fully testable from localhost. |
| **Booking** — claimable slots | New | Capacity 1 per slot. |
| Styling and layout | New | Built from scratch. No framework theme, no ported CSS. |

### Settled requirements

- Bookable slots have **capacity of 1**.
- Bookings need **no confirmation step** and **no hold expiry** — a booking is simply
  irrelevant once its slot is in the past. Cancellable by the user or an admin.
- **Archive content is public.** No gating on video.
- **Magic link** sign-in. No passwords, anywhere.
- **Archive is served as MP4** initially. HLS transcoding is deferred, with a written trigger.
- **Slots are hand-entered or imported** from CSV/JSON. No recurrence engine.
- **Times are authored venue-local**, with an optional explicit UTC offset per row for the
  cases where local time is ambiguous or the author means something specific.
- **Gallery displays / kiosk mode: deferred.** Not in this plan.
- Non-technical editors are introduced **after** the content design is in place.

### Constraints

1. External service dependencies kept to an absolute minimum.
2. Managed hosting, minimal ops.
3. **The whole stack must run on localhost**, including the full auth flow.
4. Experimental and artistic — tooling must not fight unusual content shapes.

---

## 2. What these requirements removed

Worth stating, because the plan is much smaller than it would otherwise be, and because
someone may later ask "why didn't we build X":

| Not building | Because |
|---|---|
| Signed cookies / token auth on media | Archive is public. Video is just files on a CDN. |
| Any user or content migration | Greenfield. No legacy data. |
| Row-locking transactions for booking | Capacity 1 → a unique index is the entire concurrency control. |
| Hold-expiry cron job | No holds. "Expired" is `slot.starts_at < now()` — a query filter, not a job. |
| Password reset, password storage, password rules | Magic link only. |
| HLS transcode pipeline, ladder, reconciliation | Deferred. MP4 served directly; a seam makes the later swap per-item. |
| Recurring-slot generator | Slots are hand-entered or bulk-imported from a file. |
| Social / OAuth sign-in | Ruled out — an external identity provider, and an access barrier for anyone without such an account. |
| Kiosk mode, service worker, watchdog, soak tests | Deferred. |

The two genuinely hard things left are **the content model** and **magic-link auth**.
Everything else is ordinary work.

---

## 3. Target stack

```
┌──────────────────────────────────────────────────────────┐
│  Nuxt 4 (Vue 3, TypeScript)                              │
│  · content pages   → prerendered / ISR                   │
│  · archive browser → client-rendered  (PUBLIC)           │
│  · booking         → SSR, gated                          │
│  · Nitro server    → owns the session, magic-link flow   │
└──────────┬────────────────────────────────┬──────────────┘
           │                                │
           ▼                                ▼
┌────────────────────────────┐   ┌────────────────────────┐
│  Directus (+ Postgres)     │   │  AWS                   │
│  · content (M2A blocks)    │   │  · S3   — archive      │
│  · users (store of record) │   │  · S3   — editor assets│
│  · slots + bookings        │   │  · CloudFront — public │
│  · admin UI for editors    │   │  · SES  — transactional│
└────────────────────────────┘   └────────────────────────┘

Local development:  everything above, plus Mailpit standing in for SES.
                    One `docker compose up`. No cloud account needed to run the app.
```

### Dependency budget

The complete allowed list. Adding to it requires a new ADR in this file.

| Dependency | Why it earns its place | Exit cost |
|---|---|---|
| **Directus** (Cloud or container) | Auth store, content, application data, and an admin UI editors can use. M2A gives a real page builder. Admin is Vue. | Medium — Postgres and schema are ours. |
| **AWS S3** | Archive and editor assets. | Low — object storage is fungible. |
| **AWS CloudFront** | S3 egress at $0.09/GB is not survivable for video. Free S3→CF origin pulls, 1TB/mo free tier. | **Very low** — plain public files from our bucket. Swapping to Bunny is DNS + config. |
| **AWS SES** | Transactional send — magic links, booking confirmations. $0.10/1k. | Very low — SMTP is SMTP. Mailpit substitutes locally. |
| **Listmonk** *(only if a newsletter is actually wanted)* | Marketing list stays ours. Double opt-in, unsubscribes, bounces. | Low — self-hosted, exports to CSV. |

**Explicitly rejected:** Hygraph and SaaS CMSes (content in someone else's system, priced per
call); Payload (a Next.js framework — wrong for a Vue team); Cal.com and scheduling SaaS
(they solve availability negotiation; we need slot inventory, which is two tables);
Mux / Cloudflare Stream (asset lifecycle lives in their system).

---

## 4. Architecture Decision Records

### ADR-001 — Directus as content backend and user store

**Context.** The platform needs richly structured, hierarchical content edited frequently by
non-technical people. That is a CMS requirement, and it is the single largest driver of
backend choice. Auth and booking are comparatively trivial — one gated flow, two tables.

**Decision.** Directus on Postgres.

**Rationale.**
- **Many-to-Any relationships** are purpose-built for block-based page builders. Nested,
  reorderable, mixed-type content is what Directus does, not something we bend it into.
- **Live Preview** puts the real Nuxt page beside the editor. On a site where layout *is*
  the content, an editor who cannot see the result is editing blind.
- The admin is written in **Vue** — extending it with custom interfaces uses skills the team
  already has.
- Postgres underneath, schema in version control, data exportable.

**Costs accepted.** Heavier than a minimal backend; needs Postgres. License is the Monospace
Sustainable Core License, not OSI-open — we qualify for the Open Innovation Grant
(< $5M revenue, < 50 employees). **Re-check annually.**

---

### ADR-002 — Nuxt owns the session; Directus is the user store

**Context.** Magic-link sign-in is a hard requirement. **Directus has no native magic-link
support** — it is a [long-standing open request](https://github.com/directus/directus/discussions/17888)
with only a [community extension](https://github.com/carwei/directus-magic-link-auth) available.

We are not putting the platform's only authentication path on an unmaintained third-party
extension.

**Decision.** Nitro (Nuxt's server layer) owns the magic-link flow and issues its own session
cookie. Directus holds `directus_users` as the store of record — so admins can see and manage
people in the admin UI — but does not authenticate site visitors.

**Rationale.**
- The authorization surface is genuinely tiny: **archive is public, content is public.** The
  only gated operations are *claim a slot*, *cancel my booking*, and *list my bookings*.
  Three endpoints. Enforcing that in Nitro is a modest, well-understood amount of code.
- Roughly 150 lines we own and can test, versus a dependency on someone else's extension for
  the one thing that must never break.
- **Fully testable on localhost**, which is a stated requirement — no cloud identity
  provider, no tunnels, no verified sending domain needed to sign in during development.

**Cost accepted.** Authorization for site users lives in Nitro rather than in Directus
permissions. Directus permissions still govern content, assets, and the admin UI.

**Revisit if:** the gated surface grows much beyond those three endpoints. If a future phase
adds many member-only collections, pushing authz back into Directus becomes worth the
migration. Note that trigger here if it happens.

### ADR-003 — Build the booking system; capacity 1 makes it simple

**Context.** Fixed inventory of slots that logged-in users claim. Capacity is 1. No
confirmation step, no holds.

**Decision.** Two tables and one endpoint.

**The concurrency control is a partial unique index:**

```sql
CREATE UNIQUE INDEX bookings_slot_unique
  ON bookings (slot)
  WHERE status = 'confirmed';
```

Two simultaneous claims both attempt an insert. Postgres admits one and rejects the other
with a unique violation. Catch it, return 409.

**This is the correct solution, not a shortcut.** It puts correctness in the database, where
concurrency belongs. No `SELECT … FOR UPDATE`, no explicit transaction, no application-level
locking. The naive alternative — read availability, check in application code, then write —
is a race condition that passes every manual test and fails on opening night.

The partial predicate matters: a cancelled booking must not block re-claiming the slot.

**Expiry is not a job.** A booking is irrelevant once `slot.starts_at < now()`. That is a
query filter. Nothing runs on a schedule.

---

### ADR-004 — Public MP4 on S3 behind CloudFront; HLS deferred behind a seam

**Context.** The archive is public, which removes gating entirely. The files already exist as
MP4. What remains is cost and playback quality.

S3 egress is **$0.09/GB**, so serving from the bucket directly is not viable at any scale.

**Decision.**
1. **Serve the existing MP4s** through CloudFront. No transcode job now.
2. **Verify faststart** on every file — the `moov` atom must precede `mdat`, or the browser
   downloads the whole file before it can play or seek. This is a remux (`-c copy`), not a
   re-encode, and it is the highest-value hour in Phase 3.
3. **Abstract the playback source** behind one composable so the player never references a
   container format. HLS later becomes a change in one place, applied **per item**.
4. **Write down the trigger** for when HLS happens (Phase 3 §3.8), with a named owner.

**Costs accepted, stated precisely:**

- **Whole-file egress.** A progressive MP4 transfers entirely even if someone watches ten
  seconds. On an archive people browse and sample, most sessions are short — so you pay full
  price for partial views. This is the real cost, and it scales with casual browsing.
- **No adaptive bitrate.** A visitor on mobile data gets the same file as one on fibre, and
  will buffer. The player cannot help.

Neither is fatal at small scale — CloudFront's always-free 1TB/month is roughly 500 full plays
of a 2GB work. That is why deferring is reasonable, and why the trigger matters: it converts
"we'll do it eventually" into a number someone owns.

**Escape hatch.** Bunny is ~10× cheaper per GB delivered. Because we serve plain files from our
own bucket, switching is DNS plus config.

---

### ADR-005 — SES for transactional mail; Mailpit locally

**Context.** Magic-link auth makes email **load-bearing for sign-in**. If mail breaks, nobody
can log in. This raises the stakes considerably compared to a password-based system.

**Decision.** SES in deployed environments; Mailpit in local development. Directus and Nitro
both send via SMTP, so the only difference between environments is configuration.

**Consequences.**
- SES **sandbox mode** blocks sending to unverified addresses. Production access takes days to
  approve — **file the request in Phase 1.**
- Magic-link mail must be logged and monitored. A silent send failure is a user who cannot
  sign in and has no way to tell you.
- If a newsletter is ever wanted, it goes through **Listmonk on a separate subdomain** with
  separate DKIM — so a flagged campaign can never take sign-in mail down with it. Not in
  scope until someone asks for it.

---

## 5. Phase map

```
Phase 1 ── Foundation & local environment        [everything runs on localhost]
   │        Includes the magic-link SPIKE — the one unverified thing in the plan.
   ▼
Phase 2 ── Design system & layout               [from scratch]
   │
   ▼
Phase 3 ── Archive  ────────────────┐  (port + public MP4 delivery)
   │                                │   AWS work here is independent and
   ▼                                │   can run in parallel with Phase 4
Phase 4 ── Content model & blocks ◄─┘
   │
   ▼
Phase 5 ── Magic-link auth
   │
   ▼
Phase 6 ── Booking
   │
   ▼
Phase 7 ── Production: deploy, SES, domains, hardening
```

| Phase | File | Blocked by | Rough size |
|---|---|---|---|
| 1 | `01-phase-1-foundation.md` | — | 3–5 days |
| 2 | `02-phase-2-design-system.md` | 1 | ~1 week |
| 3 | `03-phase-3-archive.md` | 1, 2 | ~1 week |
| 4 | `04-phase-4-content-model.md` | 1, 2 | 1–2 weeks |
| 5 | `05-phase-5-auth-magic-link.md` | 1 (spike done) | ~1 week |
| 6 | `06-phase-6-booking.md` | 5 | ~1 week |
| 7 | `07-phase-7-production.md` | all | ~1 week |

---

## 6. Cross-cutting rules

Restated for the coding agent in `CLAUDE.md`.

1. **No new external service** without adding an ADR here first.
2. **`docker compose up` + `pnpm dev` must be the entire local setup.** Every feature,
   including the full sign-in flow, works with no cloud account and no network access to a
   vendor. If a feature cannot be exercised locally, it is not finished.
3. **Never serve video directly from S3.** CloudFront always.
4. **Never trust the client** for availability, entitlement, or identity. Session identity is
   read server-side, never from a request body.
5. **Directus Flows are not a job queue** — no retries, no dead-letter. Anything that must not
   be silently lost is logged to a collection and retried deliberately.
6. **Times are authored venue-local; an explicit offset overrides.** No offset means
   venue-local — that is what a human writing a schedule intends. An explicit offset
   (`+02:00`, `Z`) is honoured as written. Both resolve to a `timestamptz` instant, with the
   authored zone stored alongside so intent is recoverable. A naive local time falling in the
   DST fall-back hour is **ambiguous and must be rejected**, not guessed. Date tests cover
   both DST boundaries.
7. **Keyboard operability is a baseline, not a feature.** Every interactive element is
   reachable and operable by keyboard. This is ordinary accessibility, and it also happens to
   be what a deferred kiosk mode would need.
8. **Schema changes are committed.** A change clicked into the Directus admin is snapshotted
   and committed in the same PR as the code depending on it.
9. **Each phase ends with its acceptance criteria demonstrably met.**

---

## 7. Open questions

| # | Question | Blocks | Why |
|---|---|---|---|
| **Q1** | What is the venue's IANA timezone, and are all slots in one place? | 6 | It is the default for every time authored without an offset. |
| **Q3** | Cancellation policy — can users cancel at any time, or is there a cutoff? | 6 | Small, but affects the endpoint and the UI. |
| **Q4** | Archive inventory: item count, total GB, containers, codecs, and faststart status? | 3 | Determines what needs remuxing before it can be served. |
| **Q5** | Is a newsletter wanted at all, now or later? | 7 | Determines whether Listmonk enters the dependency budget. |
| **Q6** | Magic-link session lifetime — how long should someone stay signed in? | 5 | An art platform used occasionally probably wants weeks, not hours. |

---

## 8. Using these documents with Claude Code

- Split this document into `docs/plan/` in the repo. Put `CLAUDE.md` at the repo root.
- One session per phase: `Read docs/plan/03-phase-3-archive.md and work through it. Stop at
  the acceptance criteria and report.`
- Each phase doc ends with **Guardrails** — what is deliberately out of scope for that phase.
  Respect them; phases are ordered by risk.
- Vendor specifics were accurate in August 2026. Verify env vars, endpoints, and prices
  against current documentation.
