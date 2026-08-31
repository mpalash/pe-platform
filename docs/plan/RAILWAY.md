# Deploying to Railway

Three services in one Railway project. `DEPLOYMENT.md` argues the platform choice
and owns the **ordering rule**; this is the runbook.

| Service | Source |
|---|---|
| Postgres | Railway managed |
| Directus | Docker image `directus/directus:12.3.0` (pinned — hard rule on versions) |
| Nuxt | GitHub `mpalash/pe-platform` |

**Order, every time: schema → Directus → Nuxt.** Nuxt queries fields Directus owns.
Deploy Nuxt first and it asks for columns that do not exist yet. The window is
short and it is a real outage.

---

## 1. Postgres

*New → Database → PostgreSQL.* Nothing to configure. The other services
reference it as `${{Postgres.DATABASE_URL}}`.

## 2. Directus

*New → Docker Image →* `directus/directus:12.3.0`.

```
DB_CLIENT=pg
DB_CONNECTION_STRING=${{Postgres.DATABASE_URL}}
KEY=<openssl rand -hex 32>
SECRET=<openssl rand -hex 32>
ADMIN_EMAIL=<you>
ADMIN_PASSWORD=<generate, then change on first login>
ADMIN_TOKEN=<openssl rand -hex 24>
PUBLIC_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
HOST=::
PORT=8055
CORS_ENABLED=true
CORS_ORIGIN=https://<nuxt-domain>

STORAGE_LOCATIONS=s3
STORAGE_S3_DRIVER=s3
STORAGE_S3_KEY=<AWS_ASSETS_ACCESS_KEY_ID>
STORAGE_S3_SECRET=<AWS_ASSETS_SECRET_ACCESS_KEY>
STORAGE_S3_BUCKET=aam-pe-directus
STORAGE_S3_REGION=eu-north-1
STORAGE_S3_ENDPOINT=s3.eu-north-1.amazonaws.com
```

**`HOST=::` is not optional.** Railway's private network is IPv6-only. Directus
defaults to `0.0.0.0`, which answers on IPv4 alone, so `PUBLIC_URL` and the
public domain work fine while Nuxt's private-network call to
`directus.railway.internal:8055` fails — a service that looks healthy from a
browser and is unreachable from the service next to it.

**`ADMIN_TOKEN` saves the manual step in §3.** Directus mints that exact static
token on the admin user at first boot, so the service token exists before
anything needs it and does not have to be clicked out of the admin UI. It is
the same credential §3 and §4 use; treat it as the secret it is.

**`s3`, not `s3,local`.** The container disk is ephemeral, so a `local` location
loses every upload on the next deploy. That is safe on a fresh database. If you
ever migrate the local development database up, anything already written to the
local volume must be copied to S3 first — a file records its location at upload
time and that value is never rewritten, so those `directus_files` rows would
otherwise point at storage that no longer exists.

## 3. Schema and content

Run from a laptop, against the deployed Directus, **before** Nuxt goes up.

```bash
NUXT_DIRECTUS_URL=https://<directus-domain> \
NUXT_DIRECTUS_SERVICE_TOKEN=<service token from the Directus admin> \
pnpm directus:apply && pnpm seed:pages && pnpm directus:seed-settings
```

The token is the `ADMIN_TOKEN` from §2 — already minted at first boot. (Creating
one by hand in *Settings → Access Tokens* on a user with the admin policy works
too, and is what you do if you ever rotate it.) It is the credential Nuxt uses for everything server-side, and it
must never reach the browser — `pnpm check:bundle` greps the client build for it.

## 4. Nuxt

*New → GitHub Repo →* `mpalash/pe-platform`. Nixpacks detects `pnpm-lock.yaml`.

- Build: `pnpm build` — already chains `archive:sources` and `archive:pool`
- Start: `node .output/server/index.mjs`
- Port: **set `PORT=3000` explicitly.** The generated domain is created pointing
  at target port 3000, but the container came up on 8080 — Nitro's own default
  is 3000, so something in the Railway environment supplies 8080 — and the
  domain then answers **502 Application failed to respond** with a perfectly
  healthy app behind it. The deploy log line `Listening on http://[::]:3000` has
  to match the domain's target port; if you would rather move the domain than
  pin the app, that is the same fix from the other end.

```
NUXT_DIRECTUS_URL=http://${{Directus.RAILWAY_PRIVATE_DOMAIN}}:8055
NUXT_DIRECTUS_SERVICE_TOKEN=<same token>
NUXT_PUBLIC_DIRECTUS_URL=https://<directus-domain>
NUXT_PUBLIC_SITE_URL=https://<nuxt-domain>

NUXT_PUBLIC_MEDIA_BASE=https://media.purgatoryedit.com/
NUXT_PUBLIC_MEDIA_ALLOW_ORIGIN_FALLBACK=false

NUXT_SESSION_COOKIE_SECURE=true
NUXT_SESSION_TTL_DAYS=30
NUXT_PREVIEW_TOKEN=<generate>

NUXT_SMTP_HOST=email-smtp.eu-north-1.amazonaws.com
NUXT_SMTP_PORT=587
NUXT_SMTP_USER=<SES SMTP username>
NUXT_SMTP_PASS=<SES SMTP password>
NUXT_SMTP_FROM=no-reply@purgatoryedit.com
```

`NUXT_DIRECTUS_URL` uses `RAILWAY_PRIVATE_DOMAIN` deliberately: server-to-server
traffic stays on the private network and is not billed as egress. Only
`NUXT_PUBLIC_DIRECTUS_URL` — which the browser uses for asset URLs — is public.

## 5. Smoke check

Per `DEPLOYMENT.md` §5, and in this order:

1. Home page renders.
2. `/archive` — accept the advisory, a clip plays. If it does not, check
   `NUXT_PUBLIC_MEDIA_BASE` before anything else.
3. Sign-in email arrives and the link mints a session.
4. **Redeploy Nuxt, then reload while signed in.** The session must survive. It
   lives in `auth_sessions` now; if this fails, something has put it back on
   disk.

## Notes

- **The built server does not read `.env`.** Nuxt loads it in development only,
  so every variable above has to exist in Railway. Verified locally: running
  `node .output/server/index.mjs` with no environment serves `/archive` (which
  needs nothing) but 404s `/` (which needs Directus). With the variables set,
  both are 200. A 404 on the home page after a deploy means a missing variable,
  not a broken route.

- **Railway has no spending cap by default.** A leak bills until someone
  notices. `DEPLOYMENT.md` §3 prefers Render for exactly this reason; Railway
  was chosen with the trade understood. This workspace now carries a usage
  limit: **soft $35** (warning email) and **hard $46** — €40 at 1.16, the euro
  figure being the number that was actually meant. Whole dollars is all the
  limit accepts. Note what a *hard* limit does: workloads are shut down, so
  reaching it takes the site offline rather than running up a bill. That is the
  trade being made on purpose.
- The repo carries an 18MB `public/data/edits.json`. Fine, but it makes builds
  and clones larger than they look.
- Directus schema changes are applied from a laptop, not by the app at boot.
  That is deliberate — see `DEPLOYMENT.md` §6.

---

## Deployed 2026-08-31

| | |
|---|---|
| Project | `pe-platform` — Railway project `df93e800-51c1-4b2b-9e6f-2c69c6f7d59d`, region EU West (Amsterdam) |
| Site | https://pe-platform.up.railway.app |
| Directus | https://pe-cms.up.railway.app |

Credentials for the deployed environment are in `.env.railway` — gitignored by
the `.env.*` rule, and the file the schema/seed commands are sourced from:

```bash
set -a; source .env.railway; set +a
pnpm directus:apply && pnpm seed:pages && pnpm directus:seed-settings
```

Verified on the day: `/api/status` reports `connected: true` over the private
network; 15 collections applied including `auth_sessions` and
`auth_login_tokens`; 6 pages seeded; `/archive` 200 with no `amazonaws.com`
string anywhere in the HTML or the client chunks, and clips and thumbnails
answering `206` from `media.purgatoryedit.com`; the service token absent from
every client chunk; a Directus upload landing with `storage: "s3"` and
streaming back through `/assets/<id>`.

**Not verified, because it cannot be yet:** sign-in. SES is still sandboxed with
DKIM failed — `SES.md` — so no `NUXT_SMTP_*` variables are set and a sign-in
request cannot send. §5 steps 3 and 4 stay open until that is done. The session
store itself is in the database rather than on disk, which is the part step 4
was really guarding.

A file called `_deploy-storage-check.png` sits in Directus files from the S3
check above. Nothing references it; delete it whenever.
