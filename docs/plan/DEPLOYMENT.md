# Deployment strategy & platform options

> **Reference document, not a phase.** Read it twice: in **Phase 1**, to make the hosting
> decision the foundation depends on, and in **Phase 7**, to execute it.

---

## 1. What actually needs a home

The stack has three runtime pieces plus services already settled by the ADRs:

| Piece | Needs | Already decided |
|---|---|---|
| **Nuxt** | Node runtime with SSR (booking pages must reflect live availability) | — |
| **Directus** | A container, always on | — |
| **Postgres** | Managed, with automated backups | — |
| Media | S3 + CloudFront | ADR-004 |
| Email | SES | ADR-005 |

The whole deployment question is where the first three live.

---

## 2. The decision that matters: one platform, or split

**Recommendation: put all three on one platform.**

A common instinct is to split — Nuxt on Vercel or Cloudflare for edge performance, Directus and
Postgres somewhere else. For this project that is the wrong trade:

| One platform | Split |
|---|---|
| One vendor, one bill, one dashboard | Two vendors to reason about and pay |
| **Private networking** between Nuxt ↔ Directus ↔ Postgres | Every SSR request hits Directus over the public internet |
| One deploy pipeline, one set of secrets | Two pipelines, secrets duplicated |
| Fits the dependency budget as written | Adds an entry to it |

The private-networking point is the substantive one. Booking pages are SSR and every render
queries Directus. Keeping that hop inside one platform's network is faster, and it means the
Directus API need not be exposed publicly at all — only the admin UI, on its own subdomain.

**The edge-performance argument does not apply here.** The content pages are prerendered and
cached at a CDN anyway; the video — the only large payload — is already on CloudFront and never
touches the app platform at all. What is left for the app server is HTML and small JSON. Putting
that on the edge buys very little.

---

## 3. Platform options

### Recommended: Render or Railway

Both host all three pieces, both are genuinely low-ops, both deploy from a git push.

| | **Render** | **Railway** |
|---|---|---|
| Compute | ~$7/mo per always-on service | ~$6–9/mo per service |
| Managed Postgres | ~$7/mo (small) to ~$25/mo | Metered, ~$7–13/mo |
| Realistic total here | **~$25–45/mo** | **~$20–30/mo** |
| Spending behaviour | More predictable | **No spending cap** — a leak or spike keeps billing |
| Egress | $0.15/GB after an allowance | Metered |
| Developer experience | Solid, plainer | Notably nicer |
| EU region | Frankfurt | Yes |

**Render's usual objection doesn't bite here.** Its egress pricing is the thing people complain
about — but because ADR-004 put video on CloudFront, the app platform only ever serves HTML and
JSON. The big bytes never cross it. That removes Render's main disadvantage for this
architecture specifically.

**Railway's uncapped billing is a genuine risk** for an organisation on a fixed budget. There is
no automatic stop; a memory leak bills until someone notices.

**→ Take Render if predictable cost matters more than developer experience.** For an arts
organisation, it usually does. Take Railway if the team will feel the DX difference daily and
someone will watch the bill.

### Do not default to Directus Cloud

Directus Cloud hosting is **$99/month**. Under the **Open Innovation Grant** — under $5M revenue
and under 50 employees, which this project comfortably meets — self-hosted Directus is free with
no feature caps.

So $99/month buys hosting alone, for a container that costs $7–14/month on Render or Railway.
It is a reasonable purchase for a team with no appetite for containers; it is poor value here,
given you are already running a platform that hosts containers.

### Worth knowing about: Coolify on Hetzner

A single VPS running [Coolify](https://coolify.io/docs), which gives a Heroku-like experience —
git-push deploys, a web UI, managed containers — on hardware you rent.

- **~€5–20/month for everything**, including Postgres.
- **EU data residency** by default, which may matter (see §7).
- Philosophically aligned with the project: own your stack, minimal external dependencies.

**But it contradicts the stated constraint.** You become the sysadmin: OS patches, Coolify
upgrades, backup verification, and the 2am pager when the disk fills. "Managed PaaS, minimal
ops" was an explicit requirement, and this is not that.

Worth revisiting in a year if the platform bill becomes annoying and someone on the team
genuinely enjoys infrastructure. Not the place to start.

### If Nuxt later outgrows the shared platform

Cloudflare Workers via Nitro is the cheapest option at scale, and Nuxt deploys there cleanly.
Reach for it if traffic grows enough that app-server compute becomes a real line item — accepting
that Directus then sits behind a public API call. Not a day-one concern.

---

## 4. Environments

Three, and no more:

| Environment | Where | Mail | Purpose |
|---|---|---|---|
| **Local** | `docker compose` | Mailpit | All development. Full sign-in flow works offline. |
| **Staging** | Same platform, separate services | **SES**, verified test address | Rehearses production, including email |
| **Production** | | SES | |

**Staging must use SES, not Mailpit.** On a magic-link platform, mail *is* the login path — if
the only place real email is exercised is production, then sign-in is only ever tested in
production. That is the one environment difference worth paying for.

Staging gets its own Postgres and its own Directus. Do not point two environments at one
database; it is the shortcut that eventually destroys real content.

**Skip per-PR preview environments.** They are appealing, but each needs a Directus instance and
a database, which is most of the cost of a whole environment. Front-end-only previews are fine
if the platform gives them cheaply — just be clear they talk to staging's Directus.

---

## 5. The deploy pipeline

```
git push
   │
   ▼
CI ── typecheck · lint · unit tests · pnpm test:booking (real Postgres)
   │
   │   Booking concurrency suite is a merge gate. It is the one test
   │   that catches a bug manual clicking never will.
   ▼
Deploy, in this order:
   1. Apply Directus schema      ← must precede the code that depends on it
   2. Deploy Directus
   3. Deploy Nuxt
   │
   ▼
Smoke check: home page · an archive item plays · sign-in email sends
```

**Order is not arbitrary.** Nuxt reads a schema Directus owns. Deploy Nuxt first and it queries
fields that do not exist yet; the window is short but it is a real outage. Schema, then backend,
then frontend — every time.

---

## 6. Directus schema changes — the part that bites

This is the most error-prone thing about operating this stack, and it deserves a written
procedure rather than improvisation.

**The workflow:**

1. Make the change by clicking in the **local** Directus admin.
2. `pnpm directus:snapshot` → writes to `directus/migrations/`.
3. Commit the snapshot **in the same PR** as the code depending on it. (Hard rule 12.)
4. CI applies it to a clean database and runs tests against it.
5. Deploy applies it to staging, then production.

**Never make schema changes directly in the production admin UI.** It works, which is exactly
the problem — production drifts from the repo, the next snapshot apply either clobbers the drift
or fails confusingly, and nobody remembers what was changed. Lock this down by policy, and
consider restricting who holds a production admin account that can alter schema at all.

**Schema changes are not reversible the way code is.** A dropped column takes its data with it.
So use **expand/contract** for anything destructive:

| | Deploy 1 — expand | Deploy 2 — migrate | Deploy 3 — contract |
|---|---|---|---|
| Rename a field | Add the new field; write to both | Backfill; switch reads to the new one | Drop the old field |
| Change a type | Add a new column | Backfill with conversion | Drop the old |

Three deploys instead of one, and each is individually reversible. For a rename of a field with
real content in it, that is worth the extra work.

**Rollback reality:** Nuxt rolls back trivially — redeploy the previous build. Directus schema
does not. Your actual recovery path for a bad schema change is a **database restore**, which is
why §8 insists the restore is tested before launch rather than after.

---

## 7. Regions and data residency

If the venue and its audience are in the EU — likely, given a physical venue taking bookings —
choose EU regions **everywhere**, and do it at creation time. Region is not something you change
later without a migration.

- App platform: Frankfurt or equivalent
- Postgres: same region as the app, for latency as well as residency
- **S3 bucket:** an EU region
- **CloudFront:** global by design, but you can restrict price classes; the origin stays in EU
- **SES:** an EU region — worth noting, since SES region is easy to leave at a US default

You will be holding names, email addresses, and booking records — modest, but personal data
attached to attendance at events, which is exactly the category people care about. Getting the
regions right at the start costs nothing.

---

## 8. Operational baseline

Small, and matched to what actually hurts on this platform.

**Backups.** Automated Postgres backups, and **a restore performed successfully before launch.**
An untested backup is a hope. This is the single item here that is worthless if skipped and
catastrophic when needed — and per §6 it is also your only real rollback for a schema mistake.

S3 handles media and editor uploads durably; enable versioning on the assets bucket so a
deleted image is recoverable.

**Health checks.** Both services. Directus's readiness endpoint, and a Nuxt route that checks it
can reach Directus.

**Graceful degradation.** If Directus is down, prerendered content pages should still serve —
they are static. Make sure a Directus outage does not take the whole site down, only the dynamic
parts. Test this by stopping Directus in staging and browsing the site.

**Monitoring** (from Phase 7, restated because it is deployment-shaped):

- Uptime on the site and on Directus
- **Sign-in failure rate** — the most important signal here. If magic-link mail breaks, nobody
  can log in, and without this you learn from a complaint days later.
- `email_log` failures, surfaced where a human looks
- Booking 409 rate — a background rate is normal; a spike means something popular or something
  broken
- AWS Budget alarm on CloudFront (Phase 3)

**Secrets.** Platform environment variables, never the repo. Different values per environment.
The Directus service token is server-side only — Phase 1 established a check that it is absent
from the client bundle; keep that check in CI.

---

## 9. What this costs

Realistic monthly, at the scale this platform starts at:

| | |
|---|---|
| Nuxt service | $7 |
| Directus service | $7–25 (Directus wants ~512MB–1GB; start small, watch it) |
| Postgres | $7–25 |
| S3 storage | a few dollars |
| CloudFront | $0 within the 1TB/month free tier |
| SES | effectively $0 at this volume |
| **Total** | **~$25–60/month** |

Staging roughly doubles compute, so budget another $15–30 — or run staging on smaller instances,
since it does not need to be fast.

For comparison: Directus Cloud alone would be $99/month.

---

## 10. Decisions to record

Fill these in during Phase 1, since the foundation depends on them:

```
Platform:                    ______
Region:                      ______
Postgres plan:               ______
Staging: yes / no            ______
Domain and subdomain plan:   ______
Who holds production admin:  ______
Monthly budget ceiling:      ______
```

The subdomain plan, from Phase 7:

```
example.org           → Nuxt
media.example.org     → CloudFront
admin.example.org     → Directus (admin UI only; API stays on the private network)
mail.example.org      → SES transactional
news.example.org      → Listmonk, only if a newsletter is wanted
```
