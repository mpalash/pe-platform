# Phase 1 — Foundation & local environment

> **Blocked by:** nothing. Start here.
> **Blocks:** everything.
> **Size:** 3–5 days.

---

## Goal

A new repository where `docker compose up` and `pnpm dev` give a complete working
environment — Nuxt, Directus, Postgres, and a local mail catcher — with **no cloud account
required**. Plus a spike that answers the one genuinely unverified question in the plan.

---

## Why the localhost requirement shapes this phase

"Auth should be testable from localhost" sounds like a nice-to-have. It is not — it is the
constraint that decides how the environment is built.

Magic-link sign-in means **email is part of the login path**. If email only works in a
deployed environment, then sign-in only works in a deployed environment, and every auth
change becomes a deploy-and-pray cycle. Catching mail locally with **Mailpit** removes that
entirely: you click a link in a local web UI and you are signed in.

Get this right in Phase 1 and Phase 5 is pleasant. Get it wrong and Phase 5 is miserable.

---

## Steps

### 1.1 — Repository scaffold

New repo. Nuxt 4, Vue 3, TypeScript, pnpm.

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest) wired and passing on an empty project.
- Strict TypeScript. Turn it on now, while there is nothing to fix.
- `CLAUDE.md` at the root, `docs/plan/` populated.
- `.env.example` committed with every variable the app reads, documented. `.env` gitignored.

### 1.2 — `docker compose up`

One file bringing up:

| Service | Purpose | Local port |
|---|---|---|
| **Postgres** | Directus database | 5432 |
| **Directus** | Content, users, application data | 8055 |
| **Mailpit** | Catches all outbound mail; web UI to read it | 1025 SMTP / 8025 web |

Requirements:

- **Pin every image version.** No `:latest`. A backend that silently upgrades under you is a
  bad afternoon.
- Named volumes so data survives a restart, and a documented way to wipe and reseed.
- Directus configured to send mail via SMTP to Mailpit — no credentials, no TLS, because it
  is a local trap.
- Health checks, so `docker compose up` blocks until Directus is genuinely ready rather than
  merely started.

**Verify:** trigger any Directus email (an admin invite is easiest) and read it at
`http://localhost:8025`. That single check proves the whole local mail path works, and
everything in Phase 5 depends on it.

### 1.3 — Directus bootstrap and schema in version control

- Admin account created by a documented, repeatable bootstrap step — not by hand.
- `pnpm directus:snapshot` and `pnpm directus:apply` wired up, writing to
  `directus/migrations/`.
- Commit the empty baseline snapshot.

From here on, **any schema change made by clicking in the admin UI gets snapshotted and
committed in the same PR** as the code depending on it. (Hard rule 12.) Establish this
habit now, on an empty schema, rather than discovering the drift in Phase 4.

### 1.4 — Nuxt ↔ Directus wiring

- A **server-only** Directus client in `server/utils/`, using a service token.
  **The service token must never reach the browser bundle.** Add a build-time check or a test
  that greps the client bundle for it — this is a mistake that is easy to make and expensive
  to discover.
- A trivial public read path (fetch anything from Directus, render it) to prove the
  connection end to end.
- Nitro server route conventions established: where auth goes, where booking goes.

### 1.5 — The magic-link spike ⚠️

**This is the most important part of Phase 1.**

Directus has **no native magic-link authentication**. It is a long-standing open request
([#8288](https://github.com/directus/directus/discussions/8288),
[#15850](https://github.com/directus/directus/discussions/15850),
[#17888](https://github.com/directus/directus/discussions/17888)), and the only off-the-shelf
option is a [community extension](https://github.com/carwei/directus-magic-link-auth).

ADR-002 decided **not** to depend on that extension, and instead to have Nitro own the
session. This spike proves that decision is sound before Phase 5 commits to it.

**Timebox: one day.** Build the crudest possible version:

1. A form posts an email address to a Nitro route.
2. The route finds or creates a `directus_users` record via the service token.
3. It generates a random token, stores a **hash** of it with an expiry, and emails the link.
4. Clicking the link hits a verify route, which checks the token, marks it used, and sets a
   session cookie.
5. A test page reads the session and prints the user's email.

No styling. No error handling beyond the happy path. The question being answered is only:
*does this shape work, and how long does the real version take?*

Things the spike must surface:

- **Cookies on localhost.** `Secure` cookies do not set over plain HTTP. Development needs
  `Secure: false`; production needs it true. Confirm the config split works now — this is a
  classic half-day loss discovered at deploy time.
- Whether creating users via the service token is pleasant or awkward.
- Whether Directus's user record has room for what we need, or whether a companion collection
  is required.

**Record the outcome in `05-phase-5-auth-magic-link.md` §0 before closing the
phase.** If the spike goes badly, that is a Phase 1 finding and ADR-002 gets reopened — which
is exactly why it happens now and not in Phase 5.

**If the spike goes badly, stop and escalate to a human.** Do not silently substitute an
identity provider — social sign-in has been explicitly ruled out (see ADR-002), and swapping it
in would reverse the architecture and add an external dependency without anyone deciding to.

**Judge the spike honestly.** "Fiddlier than expected" is not failure — the spike is
deliberately crude, and the real implementation always takes longer than the sketch. Failure
means something structural: sessions that cannot be made to work, a security property that
cannot be satisfied, cookie behaviour irreconcilable with the deployment. Those are worth
escalating. Friction is not.

### 1.6 — CI

GitHub Actions (or equivalent) running typecheck, lint, and tests on every PR. Set it up
while it takes ten minutes.

### 1.7 — Background task: request AWS SES production access

Not needed locally — Mailpit covers development entirely. But SES accounts start in
**sandbox mode**, only able to send to pre-verified addresses, and production access takes
**days** to approve.

Since magic-link email is the login path, a deployed environment without SES production
access is a deployed environment nobody can sign into.

**File the request during this phase.** Details in `07-phase-7-production.md` §2.

---

## Acceptance criteria

- [ ] A fresh clone, `docker compose up`, `pnpm install`, `pnpm dev` produces a working app.
      **Verified on a machine that has never run this project** — ideally someone else's.
- [ ] No cloud account, credential, or vendor network access is needed for any of the above.
- [ ] Directus reachable, admin bootstrapped by a documented repeatable step.
- [ ] An email sent by Directus appears in Mailpit at `localhost:8025`.
- [ ] Nuxt reads data from Directus through a server route.
- [ ] The Directus service token is provably absent from the client bundle.
- [ ] Schema snapshot committed; `directus:apply` reproduces it on a clean database.
- [ ] CI green on typecheck, lint, and tests.
- [ ] **Magic-link spike complete**, with a written outcome and a revised size estimate for
      Phase 5.
- [ ] SES production access requested.
- [ ] `README.md` explains setup in under a page. Someone unfamiliar follows it successfully.

---

## Guardrails — out of scope for Phase 1

- **Do not build real auth.** The spike is throwaway. Expect to delete it.
- **Do not design anything.** No colours, no type scale, no components. Phase 2.
- **Do not port the archive.** Phase 3.
- **Do not model content.** Not even a first draft of `pages`. Phase 4.
- **Do not touch AWS** beyond filing the SES request. No buckets, no distributions.
- **Do not add a CSS framework or component library.** Phase 2 decides styling, and it decides
  against both.

---

## Record before closing the phase

- Directus version pinned: **12.3.0** (`directus/directus:12.3.0`).
  Postgres **17.11-alpine**, Mailpit **v1.31.0**. Node 22+, pnpm 10.15.0, Nuxt 4.5.2.
- Hosting decision for later (Directus Cloud vs container on Railway/Render/Fly):
  **open — a Phase 7 decision.** Nothing in Phase 1 depends on it; the container is pinned and
  the schema is committed, so either path works. Note that Directus Cloud removes the
  Postgres-hosting question but reintroduces a per-seat cost.
- Magic-link spike outcome: **passed.** Full loop works on localhost — user created via the
  service token, hashed single-use token, mail caught by Mailpit, `HttpOnly` session cookie,
  identity read server-side, replay rejected. Written up in
  `05-phase-5-auth-magic-link.md` §0. **ADR-002 stands.**
- Revised Phase 5 estimate: **4–5 days** (was ~1 week). The shape is proven; what remains is
  rate limiting, Directus-backed token and session storage, real error states, and the
  role decision.

### Also worth knowing

- Directus 12 validates emails with Joi against the **IANA TLD list**. `admin@localhost` fails
  bootstrap, leaving **no admin user** while the container still reports healthy. Use
  `example.com` in fixtures.
- `/server/health` is permission-gated in Directus 12 (403 unauthenticated). Compose
  healthchecks use `/server/ping`.
- `nodemailer@9` was added for SMTP. It is a library, not a service — the dependency budget in
  `00-OVERVIEW.md` governs external services, and SES/Mailpit were already in it. No new ADR.

### Still outstanding from this phase

- **SES production access has not been requested** (§1.7). It needs an AWS account holder and
  takes days to approve. Nothing local depends on it; Phase 7 does.
- **Acceptance criterion "verified on a machine that has never run this project"** has not been
  done — it needs a second machine or a colleague.
