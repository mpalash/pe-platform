# Phase 7 — Production: deploy, email, hardening

> **Blocked by:** all previous phases.
> **Size:** ~1 week.
> **Answer needed:** **Q5** — is a newsletter wanted?

---

## Goal

The platform running on real infrastructure, with real email, at a domain, monitored — and
non-technical editors onboarded now that the content design is settled.

---

## 1. Hosting

Two things to place: the **Nuxt app** and **Directus + Postgres**.

**Nuxt** — any Node host or edge platform. It needs SSR for booking, so a purely static host
will not do.

**Directus + Postgres** — Directus Cloud, or a container platform (Railway, Render, Fly) with
a managed Postgres. Both satisfy "managed, minimal ops." Cloud is fewer moving parts; a
container is cheaper and more portable. The decision should have been noted in Phase 1;
confirm it now.

Whichever: **verify a Postgres restore actually works before launch**, not the first time you
need it. An untested backup is a hope, not a backup.

Environments: production plus at least one staging that mirrors it. Staging uses SES with a
verified test address, not Mailpit — otherwise the email path is only ever exercised in
production, which for a magic-link platform means sign-in is only ever exercised in production.

---

## 2. SES

The production access request was filed in Phase 1 (§1.7). Confirm it is **granted** — sandbox
mode only sends to pre-verified addresses, which for a magic-link platform means nobody can
sign in.

Set up:

- **Sending subdomain:** `mail.example.org`.
- **SPF, DKIM** (SES Easy DKIM), and **DMARC** on the parent domain. Start DMARC at `p=none`
  with a reporting address, read the reports for two weeks, then tighten to `quarantine`.
  **Never start at `reject`** — you will block your own sign-in mail and not know why.
- **Configuration set** with bounce and complaint events published to SNS.
- Account-level **suppression list** enabled.
- Reply address that a human reads. Mail from a `no-reply@` that bounces is both unkind and a
  deliverability signal.

**Process the bounce feed.** A hard bounce should mark the address. For magic-link auth this
is more than reputation hygiene: an address that hard-bounces is a user who can never sign in,
and someone should be able to see that.

**Verify DKIM alignment by inspecting raw headers** of a delivered message — not by trusting
the console's green tick.

---

## 3. Newsletter (Q5) — only if wanted

If no newsletter is wanted, **skip this entirely** and keep Listmonk out of the dependency
budget. Do not build it speculatively.

If one is wanted:

- **Listmonk**, own database (not a schema inside the Directus one — so an upgrade can never
  touch application data), relaying through SES.
- **Separate subdomain, separate DKIM:** `news.example.org`.

  This split is the important part. Sign-in mail and campaign mail must have separate
  reputations, because **a flagged campaign must never be able to stop people logging in**.
  On a magic-link platform, deliverability failure and total lockout are the same event.

- **Double opt-in required.** It is the consent record and it keeps the list clean.
- **Never auto-subscribe** anyone who registers or books. A separate, explicit, unticked
  checkbox.
- **Warm up** over two to three weeks — a new sending subdomain has no reputation, and sending
  5,000 messages on day one from a cold domain looks exactly like spam, because that is what
  spam does. Start small with engaged recipients, roughly double each send, watch complaint
  rates, stop and investigate above ~0.1%.

Never send marketing mail through Directus or the transactional path.

---

## 4. Domains and DNS

```
example.org           → Nuxt
media.example.org     → CloudFront
admin.example.org     → Directus  (or Directus Cloud's hostname)
mail.example.org      → SES transactional
news.example.org      → Listmonk, if §3 applies
```

HTTPS everywhere. HSTS once you are confident. Confirm the session cookie's `Secure` flag is
**on** in production — the counterpart of the local `false` set in Phase 5, and worth checking
explicitly because it is invisible when wrong until someone's session leaks.

---

## 5. Hardening pass

Now, with everything built and visible together:

**Secrets.** Nothing in the repo. Rotate anything that ever touched a laptop. Re-verify the
Directus service token is absent from the client bundle.

**Rate limits.** Beyond magic-link requests (Phase 5): the booking claim endpoint, and any
public form.

**Headers.** CSP, `X-Content-Type-Options`, `Referrer-Policy`. CSP takes iteration — start in
report-only, watch, then enforce.

**Directus admin.** Strong credentials, 2FA for every admin, and a real look at whether it
should be public at all. Confirm public API permissions expose only what is meant to be public
— by issuing unauthenticated requests, not by reading the permissions matrix.

**Error handling.** Designed 404 and 500 pages. No stack traces to users, ever.

**Cost alarms.** Confirm the Phase 3 AWS Budget alarm is live and its threshold still makes
sense against measured traffic.

---

## 6. Monitoring

Modest, and matched to what actually hurts:

- **Uptime check** on the site and on Directus.
- **Sign-in failure rate.** The most important signal on this platform — if magic-link mail
  breaks, nobody can log in, and without this you learn from a complaint days later.
- **`email_log` failures** surfaced somewhere a human looks.
- **Booking 409 rate.** A normal background rate is fine and expected. A spike means either
  something popular or something broken.
- Error tracking. If you add a service, it needs an ADR — and **scrub tokens and session
  cookies from reports**. (Phase 5 guardrail: never log tokens.)

---

## 7. Editor onboarding

By explicit decision, editors arrive now that the content design is settled.

- Walk one editor through building a real page. **Watch without helping.** Every place they
  hesitate is a finding about the block set, the naming, or the interface — not about them.
- Write a **short** guide: how to sign in, create a page, use each block, publish, and undo a
  mistake. One page. Long CMS documentation goes unread.
- Confirm the Editor role's boundaries are right in practice.
- Agree who to ask when something breaks.

**Expect this to generate work.** Feedback from a first real editor is the most useful signal
in the project — it is why Phase 4 kept the block set small and revisable. Budget for a round
of changes rather than treating them as scope creep.

---

## 8. Launch checklist

- [ ] Postgres backups automated; **a restore performed successfully**.
- [ ] Staging mirrors production, including SES.
- [ ] SES out of sandbox; DKIM alignment verified in raw headers.
- [ ] DMARC at `p=none` with reports being read.
- [ ] Bounce and complaint handling live.
- [ ] Session cookie `Secure` in production.
- [ ] Service token absent from the client bundle.
- [ ] All secrets rotated; none in the repo.
- [ ] Rate limits on magic-link request and booking claim.
- [ ] Security headers; CSP enforced after a report-only period.
- [ ] Designed 404 and 500.
- [ ] Uptime, sign-in failure, and email failure monitoring live.
- [ ] AWS Budget alarm live with a sensible threshold.
- [ ] `pnpm test:booking` green in CI.
- [ ] **Full sign-in flow verified in production with a real mail client** — Gmail, Apple Mail,
      and Outlook. This is the one that matters most; `sameSite` and link-prefetch problems
      only appear with real clients.
- [ ] Booking claimed and cancelled end to end in production.
- [ ] Archive plays on desktop and mobile, signed out.
- [ ] Editor onboarded and has published a page unaided.
- [ ] Someone other than the developer has followed the README and run the project locally.

---

## Guardrails — out of scope for Phase 7

- **Do not add services during hardening.** Analytics, error tracking, feature flags, session
  recording — each needs an ADR. Hardening is not a licence to shop.
- **Do not build an admin dashboard.** Directus is the admin.
- **Do not build a newsletter** unless Q5 says yes.
- **Do not defer the restore test.** It is the one item here that is worthless if skipped and
  catastrophic if needed.
- **Do not skip warm-up** because a launch announcement is time-sensitive. Reputation damage
  outlasts any announcement — and on this platform it takes sign-in down with it.

---

## After launch

Things deliberately deferred, recorded so they are decisions rather than oversights:

- **Gallery displays / kiosk mode.** Excluded by decision. Note that keyboard operability
  (hard rule 10) was maintained throughout, so the groundwork exists.
- **Capacity > 1 slots.** Would require revisiting ADR-003 and adding real transactions.
- **Payments.**
- **Calendar integration / ICS.**
- **Moving authorization into Directus**, if the gated surface grows well beyond three
  endpoints (the revisit trigger named in ADR-002).

---

---

*Vendor details, prices, and API specifics were accurate as of August 2026. Verify against
current documentation before relying on any particular environment variable, endpoint, or
figure.*
