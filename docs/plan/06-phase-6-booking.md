# Phase 6 — Booking

> **Blocked by:** Phase 5.
> **Size:** ~1 week.
> **Answers needed:** **Q1** (venue timezone), **Q3** (cancellation policy).

---

## Goal

Signed-in users can see available slots and claim them. A slot with capacity 1 is **never**
claimed twice, under any concurrency.

---

## 1. What the settled requirements removed

Capacity 1, no confirmation step, no holds. That is a much smaller system than the general
case, and it is worth being explicit about why:

| Not needed | Because |
|---|---|
| `SELECT … FOR UPDATE`, explicit transactions | Capacity 1 → a unique index is the entire mechanism |
| Hold/reservation state, `held_until` | No confirmation step; a claim is immediate and final |
| Expiry cron job | "Expired" is `slot.starts_at < now()` — a query filter, not a job |
| Waitlists, capacity counters, seat maps | Out of scope |

**Nothing in this phase runs on a schedule.** If you find yourself writing a cron, something
has been misunderstood.

---

## 2. The one thing that must be right

Everything about booking is easy except **not double-booking**.

The naive implementation — read availability, check in application code, then write — is a
race condition. It passes every manual test, then fails the first time two people click at
once, which will be opening night.

**The correct solution for capacity 1 is a partial unique index:**

```sql
CREATE UNIQUE INDEX bookings_slot_unique
  ON bookings (slot)
  WHERE status = 'confirmed';
```

Two simultaneous inserts: Postgres admits one, rejects the other with a unique violation.
Catch it, return 409. No transaction, no lock, no application logic.

This is not a shortcut. It puts concurrency control in the database, which is the only place
it can be correct. Application-level checking cannot be made safe no matter how carefully it
is written.

**The partial predicate is load-bearing.** Without `WHERE status = 'confirmed'`, a cancelled
booking permanently blocks its slot — which is exactly the behaviour cancellation is meant to
prevent.

---

## 3. Data model

**`slots`**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `title` | string | |
| `starts_at` | timestamptz | the resolved instant |
| `ends_at` | timestamptz | the resolved instant |
| `authored_tz` | string | IANA zone the time was written in, e.g. `Europe/Berlin` — usually the venue default |
| `status` | string | `open` / `closed` / `cancelled` |
| `notes` | text | editor-facing |

No `capacity` column. Capacity is 1 by definition; a column implying otherwise invites someone
to set it to 5 and expect it to work.

**`bookings`**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `slot` | m2o → `slots` | |
| `user` | m2o → `directus_users` | |
| `status` | string | `confirmed` / `cancelled` |
| `cancelled_at` | timestamptz, nullable | |
| `cancelled_by` | string | `user` / `admin` — worth knowing |
| `idempotency_key` | string, unique | §4 |
| `date_created` | timestamptz | |

**Indexes:**
- Partial unique on `(slot) WHERE status = 'confirmed'` — the concurrency control
- Unique on `idempotency_key`
- `(user, status)` for "my bookings"
- `(starts_at)` on slots for availability queries

**Timezone.** Times are **authored venue-local**, and a slot may carry an explicit UTC offset
instead. Either way the result is a `timestamptz` — an unambiguous instant — plus
`authored_tz` recording the zone it was written in.

Storing the authored zone as well as the instant is worth the column. It lets you re-render a
slot the way its author meant it, migrate a venue that moves, and answer "what did we actually
publish?" months later. `timestamptz` alone loses that intent.

**The ambiguity that matters.** On the night the clocks go back, local times in the repeated
hour occur **twice** — `02:30` is two different instants. A venue with evening programming will
eventually schedule across that night. A naive local time there cannot be resolved and **must
not be guessed**: reject it and require an explicit offset for that row. That is precisely what
the offset option is for, and it turns an unfixable ambiguity into a thing the author resolves
deliberately.

The mirror case: local times in the spring-forward gap **do not exist**. Reject those outright —
no offset saves them, because the author has written a time that never happens.

---

## 4. The claim endpoint

`POST /api/booking/claim` — a Nitro route.

```
Request:  { slot_id, idempotency_key }
Response: 201 { booking_id }         claimed
          409 { reason: 'taken' }    unique violation — someone was faster
          409 { reason: 'closed' }   slot not open
          409 { reason: 'past' }     slot has started
          401                        not signed in
          200 { booking_id }         idempotency_key already used → original booking
```

Requirements:

- **User comes from the session cookie.** A `user_id` in the body is ignored entirely.
  (Hard rule 6.)
- **Re-validate server-side:** slot exists, `status = 'open'`, `starts_at > now()`, and the
  user does not already hold a confirmed booking for it. The client's view is a hint, never an
  authority.
- **Catch the unique violation explicitly** and translate it to `409 taken`. A raw Postgres
  error must never reach the user.
- **Idempotency.** The client generates a key per attempt. A retry — double-click, flaky
  network, mobile browser resuming a backgrounded tab — returns the original booking rather
  than creating a second. Cheap now; miserable to retrofit.

`POST /api/booking/cancel` — session user must own the booking, or be an admin. Sets
`status = 'cancelled'`, which frees the slot via the partial index. Apply the Q3 policy.

`GET /api/booking/mine` — the session user's bookings, split upcoming and past.

---

## 5. Slot creation — hand-entered or imported

**Settled:** slots are created by hand in the Directus admin, or bulk-imported from a CSV/JSON
file. **No recurrence engine.** That is a good decision — recurrence rules interact badly with
cancellations, one-off exceptions and DST, and a venue's schedule always has exceptions.

**Hand entry** needs no work. The Directus admin already does it. Make sure the `slots`
collection is configured so it is pleasant: sensible field order, a readable display template
(title + local date/time), and a default `status` of `open`.

**Import** is a small script — `scripts/import-slots.ts` — not an interface. Requirements:

- Accepts CSV or JSON. Keep the expected columns few and obvious:
  `title, starts_at, ends_at, status, notes`.
- **Times are venue-local by default, with an explicit offset as an override.** One rule,
  stated in the file header and the README:

  | Written in the file | Interpreted as |
  |---|---|
  | `2026-09-14 19:00` | venue-local (Q1's IANA zone) |
  | `2026-09-14T19:00:00+02:00` | exactly that instant |
  | `2026-09-14T17:00:00Z` | exactly that instant |

  Venue-local is the default because it is what a human typing a schedule means. The offset
  exists for the cases where they mean something specific — a touring date in another city, a
  slot on a DST changeover night, or a file exported from a system that already emits offsets.

  Record `authored_tz` on every row: the venue zone for naive times, the offset's zone for
  explicit ones.

- **Reject ambiguous and impossible local times.** A naive time in the DST fall-back hour is
  ambiguous — report it and tell the author to add an explicit offset. A naive time in the
  spring-forward gap does not exist — report it as an error. Never silently pick one.
- **Dry run by default.** `--commit` to write. Print a table of what would be created.
- **Idempotent.** Key on `(title, starts_at)` or an optional `external_id` column, so re-running
  after a correction updates rather than duplicating.
- **Validate before writing anything**: `ends_at > starts_at`, no slot in the past, no exact
  duplicate of an existing slot, dates actually parse. Report every problem at once rather than
  failing on the first — someone fixing a sixty-row file wants the whole list.
- **Warn on overlap** with existing slots rather than blocking. Overlapping slots may be
  legitimate (two spaces, two events); silently creating them is not.

Do not build an upload UI. A script run by whoever prepares the schedule is proportionate, and
an admin who can produce a CSV can run one command.

---

## 6. Front end

- **Availability list** — SSR so it reflects live state. **Do not cache.** A cached
  availability list showing a taken slot as free is the worst UX this feature can produce.
- **Claim** — optimistic UI acceptable, but the server response is the truth. A 409 must
  render as a calm, human "someone just took that one" with the list refreshed — not an error
  toast, and never a stack trace.
- **My bookings** — upcoming and past, with cancel where Q3 allows.
- All times in venue-local, **with the timezone named**. "19:00" is ambiguous to anyone
  travelling.
- Keyboard operable, visible focus. (Hard rule 11.)
- Signed-out users see availability but are prompted to sign in on claim — with the intended
  destination preserved through the magic-link round trip (Phase 5), so they return to the
  slot they wanted.

---

## 7. Email

Booking confirmation and cancellation notices go through the same `email_log` path Phase 5
established. Write the log row on claim; the sender picks it up. (Hard rule 8.)

Confirmation content: what, when in **venue-local time with the zone named**, where, and how
to cancel.

---

## 8. Test the concurrency. Actually test it.

`pnpm test:booking`, against **real Postgres**, in CI. Manual clicking will never reproduce
the bug this suite exists to catch.

- **The race:** 50 concurrent claims on one open slot. Assert **exactly one** 201, 49 clean
  409s, and **exactly one row** in `bookings`. This is the test the whole phase is for.
- **Idempotency:** the same key sent 20 times concurrently → one booking.
- **Cancel and re-claim:** a cancelled booking does not block a new claim on that slot. This
  verifies the partial predicate.
- **Cancel race:** cancel and claim arriving simultaneously leaves a consistent state.
- **Past slot:** claiming a slot that has started returns 409.
- **DST — autumn back:** a naive local time in the repeated hour is **rejected as ambiguous**,
  and the same time with an explicit offset imports to the correct instant. Both branches
  tested.
- **DST — spring forward:** a naive local time in the non-existent gap is rejected as invalid.
- **Offset honoured:** a row with `+02:00` resolves to that instant regardless of the venue
  default, and re-renders correctly.
- **Round trip:** a slot authored venue-local displays the same wall-clock time it was written
  with, on both sides of a DST change.
- **Foreign cancel:** user A cannot cancel user B's booking. Verified against the endpoint
  directly, not through the UI.

**This suite must pass before any booking change ships.**

---

## Acceptance criteria

- [ ] Q1 and Q3 answered and recorded in `00-OVERVIEW.md`.
- [ ] Slot import script: dry-run default, idempotent, validates, resolves venue-local and explicit-offset times correctly.
- [ ] A CSV of at least 20 slots imports correctly, and re-importing it creates no duplicates.
- [ ] A CSV with deliberate errors reports **all** of them, not just the first.
- [ ] Full concurrency suite passes against real Postgres, in CI.
- [ ] A signed-in user can view availability, claim, and see it under "my bookings".
- [ ] A signed-out request to the claim endpoint returns 401 — tested directly, bypassing UI.
- [ ] A forged `user_id` in the body is ignored; the session user is used.
- [ ] Double-clicking claim creates one booking.
- [ ] A 409 renders as a calm human message with a refreshed list.
- [ ] Cancelling frees the slot and it becomes claimable again — verified end to end.
- [ ] A user cannot cancel another user's booking.
- [ ] An admin can cancel any booking from the Directus admin, and the slot frees.
- [ ] Times display in venue-local with the zone named.
- [ ] A row with an explicit offset imports to that exact instant, not the venue default.
- [ ] An ambiguous DST fall-back time is rejected with a message telling the author to add an
      offset — not silently resolved.
- [ ] A spring-forward gap time is rejected as invalid.
- [ ] `authored_tz` is populated on every slot.
- [ ] Confirmation and cancellation emails logged and delivered (Mailpit locally).
- [ ] Signing in mid-claim returns the user to the slot they wanted.
- [ ] Nothing in this phase runs on a schedule.

---

## Guardrails — out of scope for Phase 6

- **No payments.** Money is a new external dependency, a new ADR, and its own phase. Do not
  slip a Stripe integration in here.
- **No waitlists.** A whole second system with its own notification semantics.
- **No calendar sync or ICS generation** unless asked. (An ICS attachment is a reasonable later
  addition — but later.)
- **Do not build a recurrence engine.** Settled: hand entry or file import.
- **Do not build a slot-import UI.** A script is proportionate.
- **No capacity > 1.** The schema and the index both assume 1. Changing it means revisiting
  ADR-003 and adding real transactions.
- **No holds or confirmation steps.** Explicitly ruled out.
- **Do not implement availability logic in the client.**
- **Do not add a cron job.** Nothing here needs one.
- **Do not cache the availability list.**

---

## Record before closing

- Venue timezone (IANA), the default for naive times: ______
- Any slots authored with explicit offsets, and why: ______
- Import file format and column meanings, as documented for whoever prepares schedules: ______
- Cancellation policy as confirmed by a human: ______
