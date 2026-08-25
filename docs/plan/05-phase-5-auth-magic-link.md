# Phase 5 — Magic-link authentication

> **Blocked by:** Phase 1 (spike complete).
> **Blocks:** Phase 6.
> **Size:** ~1 week — revise from the Phase 1 spike.
> **Answer needed:** **Q6** — session lifetime.

---

## 0. Spike outcome — recorded from Phase 1 (2026-08-25)

```
Spike outcome:            PASSED — the shape works end to end on localhost.
What worked:              Everything the spike set out to prove. See below.
What was awkward:         Directus user creation is fine; the friction was elsewhere.
Revised estimate:         ~4–5 days, down from ~1 week.
ADR-002 still sound?      Yes. Nothing found argues for reopening it.
```

### What was proved

The full loop runs against the local stack, with no cloud account:

1. `POST /api/auth/spike/request` takes an email, finds or creates a `directus_users`
   record through the service token, issues a 32-byte token, stores **only its SHA-256
   hash** with a 15-minute expiry, and mails the link.
2. The link arrives in Mailpit at `localhost:8025`.
3. `GET /api/auth/spike/verify` validates it, marks it used, and sets the session cookie —
   `HttpOnly; SameSite=Lax; Path=/`.
4. `GET /api/auth/spike/me` reads identity **server-side from the cookie**, never from the
   request body (hard rule 6).
5. Replaying a consumed link redirects to `?error=invalid-link` — single-use holds, because
   the token is burned before a session is minted.

### Findings that change Phase 5

**1. Cookies on localhost — confirmed working, and the config split is real.**
`sessionCookieSecure` is `false` locally and drives the `Secure` attribute directly. With it
true, the browser silently drops the cookie over plain HTTP and sign-in fails with no error
anywhere. Set `NUXT_SESSION_COOKIE_SECURE=true` in deployed environments only. Verified by
reading the `Set-Cookie` header in both configurations.

**2. Creating users via the service token is pleasant, with one caveat.**
`createUser({ email, status: 'active' })` works first time. But the created user gets
**no role** — `directus_users.role` is null. That is harmless today (Nitro owns
authorization, and a role-less user cannot sign into the admin, which is what we want) but
**Phase 5 must decide deliberately**: give site visitors a dedicated zero-permission role, or
leave `role` null and document why. Do not leave it accidental.

**3. `directus_users` has room, but not for login tokens.**
The standard fields cover identity. Login tokens and sessions need somewhere durable — the
spike used a filesystem key-value store under `.data/`, which is fine for a spike and wrong
for production. **Phase 5 creates two Directus collections** (login tokens, sessions), which
also gives admins visibility and makes hard rule 12 apply to them.

**4. Directus rejects any email address whose TLD is not in the IANA list.**
Validation is Joi's `.email()`. `admin@localhost` and `anything@foo.test` both fail — and on
first boot the failure is a log line that leaves you with **no admin user at all** while the
container reports healthy. Test fixtures must use `example.com`.

**5. `/server/health` is permission-gated in Directus 12** and answers 403 unauthenticated.
`/server/ping` is the public liveness probe. Relevant to Phase 7 monitoring, not just compose.

### Cost of the real implementation

Roughly 150 lines was the ADR-002 estimate. The spike came to **164 lines of code** (276 with
comments) across four routes and two helpers — without rate limiting, without the
Directus-backed store, and without error states. Expect **300–400 lines** for the real thing.
That is still small enough that owning it beats depending on an unmaintained extension —
ADR-002 holds.

### What Phase 5 must add that the spike deliberately skipped

- Rate limiting on the request endpoint (an open mail relay for anyone with a URL, otherwise).
- Login tokens and sessions in Directus collections rather than `.data/`.
- Session rotation on sign-in, and a real sign-out everywhere.
- Error states for expired, used, and unknown links that say something useful.
- The role decision in finding 2.
- **Delete the spike**: `server/api/auth/spike/`, `server/utils/spike-*.ts`,
  `app/pages/spike.vue`, and the `spike` storage mount in `nuxt.config.ts`.

**If the spike showed this shape does not work, stop and escalate** — do not substitute
another auth mechanism unilaterally. Social sign-in was considered and ruled out: it costs an
external identity provider, and it excludes anyone without (or unwilling to use) a Google or
Facebook account to book a place at an event. For a cultural venue that is a real access
barrier. Email is universal in a way social accounts are not.

---

## 1. The situation

Directus has **no native magic-link authentication**. It is a long-standing open request
([#8288](https://github.com/directus/directus/discussions/8288),
[#15850](https://github.com/directus/directus/discussions/15850),
[#17888](https://github.com/directus/directus/discussions/17888)); the only off-the-shelf
option is a [community extension](https://github.com/carwei/directus-magic-link-auth).

ADR-002 decided against depending on that extension. **Nitro owns the session; Directus is the
user store.**

Why this is proportionate rather than reckless: the gated surface is **three endpoints** —
claim a slot, cancel a booking, list my bookings. Archive is public. Content is public. This
is not a system where authorization is spread across dozens of collections; it is one where
sign-in gates a single feature.

---

## 2. Security requirements — non-negotiable

A magic link **is** a credential. Anyone holding it is the user. Treat it accordingly.

| Requirement | Why |
|---|---|
| **Store only a hash** of the token, never the token | Database read must not yield working credentials |
| **Cryptographically random**, ≥32 bytes | Guessable tokens are an open door |
| **Single use** — invalidated on redemption | Links live in inboxes and browser history indefinitely |
| **Short expiry** — 10–15 minutes | Limits the window on a forwarded or leaked link |
| **Rate limit** by email *and* by IP | Otherwise it is a mail bomb aimed at anyone |
| **Constant-time comparison** | Avoids timing oracles |
| **Do not reveal whether an address is registered** | The request form must respond identically either way |
| **Invalidate outstanding tokens** on successful sign-in | No stale valid links after login |

**On the last point about enumeration:** the response to "send me a link" must be the same
whether or not the address exists — same message, same timing. Otherwise the form is a
membership oracle. Given accounts here are tied to bookings at an arts venue, that is a real
privacy matter, not a theoretical one.

---

## 3. The flow

```
1.  User submits email
        │
2.  Nitro: rate-limit check ─────────► exceeded → generic response, send nothing
        │
3.  Find or create directus_users record (service token)
        │
4.  Generate random token; store HASH + expiry + user in login_tokens
        │
5.  Email the link → Mailpit (dev) / SES (prod)
        │
6.  Generic response — identical regardless of whether the account existed
        │
        ▼
7.  User clicks /auth/verify?token=…
        │
8.  Hash it, look it up, constant-time compare
        │
9.  Valid, unexpired, unused?  ── no ──► friendly "link expired" + re-request form
        │ yes
10. Mark used; invalidate the user's other outstanding tokens
        │
11. Create session; set httpOnly cookie
        │
12. Redirect to intended destination
```

### Data

**`login_tokens`**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `user` | m2o → `directus_users` | |
| `token_hash` | string, indexed | **hash only** |
| `expires_at` | timestamptz | |
| `used_at` | timestamptz, nullable | |
| `requested_ip` | string | rate limiting and abuse review |
| `date_created` | timestamptz | |

**`sessions`** — or a signed stateless cookie. Prefer a **stored session**: it makes
"sign out everywhere" and admin-forced revocation possible, which a stateless JWT cannot do
without extra machinery.

Clean up expired rows periodically. This is genuinely low-stakes housekeeping, not the
carefully-designed job the previous plan needed for holds — a Directus scheduled Flow deleting
rows past expiry is sufficient.

### Session cookie

```
httpOnly: true
secure:   production only          ← false locally, or nothing works over http
sameSite: 'lax'                    ← 'strict' breaks the click-from-email flow
path:     '/'
maxAge:   per Q6
```

**`sameSite: 'lax'` is required, not a preference.** Arriving from an email client is a
cross-site navigation; `strict` drops the cookie and the user lands back at the sign-in page
with no explanation. This is the single most common way magic-link implementations fail.

**Q6 — session lifetime.** An arts platform used occasionally wants weeks, not hours. Someone
booking twice a year should not re-authenticate each visit. Suggest 30 days with sliding
renewal; confirm with a human.

---

## 4. Endpoints

```
POST /api/auth/request     { email }        → 200 always (generic), rate limited
GET  /api/auth/verify      ?token=…         → sets cookie, redirects
POST /api/auth/logout                       → clears cookie, deletes session row
GET  /api/auth/me                           → current user, or null
```

Plus:

- `useAuth()` composable — reads state, **never holds a token**.
- Route middleware for gated pages, preserving the intended destination through sign-in so the
  user lands where they were going.

---

## 5. Email

Magic-link mail is **load-bearing for sign-in**. (Hard rule 9.) If it fails silently, a user
cannot log in and has no way to tell you.

- Plain, short template. One obvious link. Plain-text alternative that is actually usable.
- State the expiry in the message: "this link works for 15 minutes."
- Include a note covering the "I didn't request this" case.
- **Log every send** to `email_log` — template, recipient, status, error. Surface failures.
- Some corporate mail scanners **pre-fetch links**, which redeems single-use tokens before the
  human clicks. Watch for this; the mitigation is a confirmation interstitial ("click to sign
  in") rather than signing in on GET. Do not build the interstitial pre-emptively, but know it
  is the fix if reports appear.

---

## 6. Local development

Hard rule 2: the whole flow must work on localhost.

1. `docker compose up`, `pnpm dev`
2. Enter any email at `/sign-in`
3. Open `http://localhost:8025` (Mailpit)
4. Click the link
5. Signed in

No cloud account, no verified domain, no tunnel. **If any step needs the internet, the
environment is wrong** — fix it here, because everything downstream depends on this loop being
fast.

---

## 7. Account model

Deliberately minimal. Magic link means there is no password to manage, and the platform gates
one feature.

- **Email is the identity.** Store it lowercased and trimmed; treat it as unique.
- Optional display name, editable after sign-in.
- No profile system, no avatars, no preferences. Add them when something needs them.
- Admins can see and manage users in the Directus admin, since `directus_users` is the store
  of record — one of the reasons ADR-002 chose it over a bespoke table.
- **Account deletion:** a user should be able to delete their account. Decide what happens to
  their bookings — almost certainly cancel future ones and release the slots. GDPR makes this
  a requirement, not a nicety; cheaper to build now than to retrofit.

---

---

## Acceptance criteria

- [ ] Full flow works on localhost with no internet access, end to end, via Mailpit.
- [ ] Requesting a link for a **non-existent** address returns an identical response — same
      body, same timing — as for an existing one.
- [ ] Token is single use: a second click on the same link fails with a friendly message and a
      re-request form.
- [ ] Expired token fails gracefully.
- [ ] Only a hash is stored — verified by inspecting the table.
- [ ] Rate limiting works by email and by IP. Verified by exceeding both.
- [ ] Signing in invalidates the user's other outstanding tokens.
- [ ] Session persists across restart and survives a browser restart per Q6.
- [ ] Logout clears the cookie **and** deletes the session row; the old cookie no longer works.
- [ ] `sameSite: 'lax'` verified by clicking a link from a real mail client, not just from the
      Mailpit UI.
- [ ] Middleware preserves intended destination through sign-in.
- [ ] Every send is recorded in `email_log`.
- [ ] Service token absent from the client bundle.
- [ ] Account deletion works and releases future bookings (or is explicitly deferred with the
      decision recorded).

---

## Guardrails — out of scope for Phase 5

- **No passwords.** Not as a fallback, not for admins. Directus admin login is separate and
  unaffected.
- **No OAuth or social providers.** Ruled out by decision — an external identity dependency
  and an access barrier for anyone without such an account.
- **Do not gate the archive or content.** Both are public. (Hard rule 4.)
- **Do not build a profile system.** Email and an optional name.
- **Do not use the community magic-link extension.** ADR-002 decided against it.
- **Do not build booking.** Phase 6.
- **Do not roll your own crypto.** Use the platform's CSPRNG and a standard hash.
- **Do not log tokens.** Not in application logs, not in error reports, not in Sentry breadcrumbs.
