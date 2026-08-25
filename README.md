# pe-platform

An experimental video archive, editorial pages, magic-link accounts, and slot booking.

Nuxt 4 in front, Directus on Postgres behind. **The whole thing runs on localhost** — including
the full sign-in flow. No cloud account, no credential, no vendor network access.

Architecture and rationale: [`docs/plan/00-OVERVIEW.md`](docs/plan/00-OVERVIEW.md).
Conventions for working in this repo: [`CLAUDE.md`](CLAUDE.md).

---

## Setup

You need [Node 22+](https://nodejs.org), [pnpm](https://pnpm.io), and a container runtime
that provides `docker` and `docker compose` (Docker Desktop, OrbStack, or colima).

```bash
cp .env.example .env       # local development values; nothing here is a real secret
docker compose up -d --wait   # Postgres + Directus + Mailpit, blocks until genuinely ready
pnpm install
pnpm dev
```

That is the entire setup. Four commands.

| What | Where |
|---|---|
| The app | http://localhost:3000 |
| Directus admin | http://localhost:8055 — `admin@example.com` / `directus-local-admin` |
| **Mailpit** — every outbound email lands here | http://localhost:8025 |

Mailpit is where sign-in links arrive in development. Nothing leaves the machine.

### Wiping and reseeding

```bash
docker compose down -v     # drops the volumes: database, uploads, captured mail
docker compose up -d --wait   # Directus bootstraps a fresh admin from .env
```

---

## Commands

```bash
pnpm dev                   # Nuxt dev server
pnpm build                 # production build
pnpm typecheck             # vue-tsc, strict
pnpm lint                  # ESLint  (pnpm lint:fix to apply)
pnpm test                  # Vitest
pnpm check:bundle          # asserts the Directus service token is absent from the
                           #   client build — run after `pnpm build`

pnpm directus:snapshot     # export the live Directus schema to directus/migrations/
pnpm directus:apply        # apply the committed schema to local Directus
```

### Schema changes are committed

Directus schema lives in `directus/migrations/schema.json`. Anything clicked into the admin UI
gets snapshotted and committed **in the same PR as the code that depends on it**:

```bash
pnpm directus:snapshot && git add directus/migrations/
```

A clean database plus `pnpm directus:apply` reproduces the committed schema exactly.

---

## Layout

```
app/            Nuxt app — pages, components, composables, styles
server/
  api/          Nitro routes. Anything touching a secret, a session, or an
                authorization decision lives here, never in client code.
  utils/        Directus client (service token, server-only), session helpers
directus/
  migrations/   committed schema snapshots
  extensions/   mounted into the Directus container
scripts/        schema tooling, bundle checks, media utilities
docs/plan/      the build plan, one file per phase
test/           Vitest
```

---

## The one rule worth repeating here

**The Directus service token is a full-admin credential and is server-only.** It must never
reach the browser bundle. `pnpm check:bundle` greps the built client output for it and fails
if it appears; CI runs that on every pull request.

The remaining rules are in [`CLAUDE.md`](CLAUDE.md) — read it before changing anything
structural.

---

## Status

**Phase 1 — foundation.** The app is deliberately unstyled: design starts in Phase 2, and
starting it earlier would prejudge it.

`/spike` is the throwaway magic-link spike from Phase 1 §1.5. It works, and it is not the real
implementation — Phase 5 builds that and deletes this. Findings are recorded in
[`docs/plan/05-phase-5-auth-magic-link.md`](docs/plan/05-phase-5-auth-magic-link.md) §0.
