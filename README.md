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
pnpm directus:model        # create the content model (idempotent)
pnpm directus:roles        # Editor role, permissions, Live Preview URL (idempotent)
pnpm seed:pages            # seed the five real content pages
pnpm directus:prune        # report block items no page references
                           #   (add --delete to remove them)
```

### First run, with content

```bash
docker compose up -d --wait
pnpm install
pnpm directus:model && pnpm directus:roles && pnpm seed:pages
pnpm dev
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

## Design system

Hand-written tokens and six layout primitives in `app/assets/styles/`. No framework, no
component library — that is the brief, and `pnpm test` enforces it.

**The site is dark only** and **does not self-host fonts** (system stack, pending real
content). Both are deliberate decisions, recorded in banner comments at the top of
`tokens.colour.css` and `tokens.type.css`.

`/reference` renders every token and primitive on one page, with contrast ratios computed
live from the resolved cascade. It is what to look at when judging whether a token change
holds together, and it is far cheaper to maintain than a Storybook at this scale.

---

## Content model

Pages are a tree — hierarchy is the self-referencing `parent` field, and URLs are derived by
walking it rather than stored, so they cannot drift. Each page is a list of blocks assembled
in Directus's many-to-any interface.

Six block types: `block_richtext`, `block_media`, `block_logos`, `block_people`, `block_faq`,
`block_advisory`. Each one is justified by a page that needs it —
[the argument is in the plan](docs/plan/04-phase-4-content-model.md).

Adding a block type means two things and no more: a collection in
`scripts/directus-content-model.ts`, and a name-matched component in
`app/components/blocks/`. `block_thing` resolves to `BlockThing`. **Those components must stay
registered with `pathPrefix: false` and `global: true`** — without either, blocks render as
nothing at all, with their content sitting invisibly in HTML attributes.

Blocks are dumb: the page fetches, the block renders. A block that fetches its own data is a bug.

**Draft content is not reachable publicly.** Every public read goes through a Nitro route that
filters to `status = 'published'`, and the Directus public role has no access to content
collections at all. Drafts are visible only through the token-guarded `/preview` route that
Directus Live Preview points at.

---

## The archive

`/archive` browses 30,651 clips with search, an intensity filter, shuffle and bookmarks.
Ported from pe-vue; the metadata is a static file at `public/data/edits.json`.

**Media URLs come from `usePlaybackSource` and nowhere else.** It is the seam that makes the
later MP4 → HLS swap a one-place change, and it is the only file permitted to name a container
format. Point `NUXT_PUBLIC_MEDIA_BASE` at a CloudFront distribution.

Until that distribution exists, `NUXT_PUBLIC_MEDIA_ALLOW_ORIGIN_FALLBACK=true` lets the player
read straight from the S3 bucket so it can be exercised locally. **Never set that in a deployed
environment** — S3 egress is $0.09/GB billed per view, which is what hard rule 3 exists to
prevent. It warns in the console and shows a banner above the feed.

---

## Status

**Phase 4 done, Phase 3 partly done.** Five real pages render from Directus, and the archive
player and toolbar are ported and working. Magic-link auth (Phase 5) and booking (Phase 6) are
still to come.

Known gaps, both needing an AWS account:

- Directus stores uploads on local disk; it should point at the S3 assets bucket.
- No CloudFront distribution, no faststart audit, no HLS trigger — Phase 3 §3.2, §3.4, §3.8.

`/spike` is the throwaway magic-link spike from Phase 1 §1.5. It works, and it is not the real
implementation — Phase 5 builds that and deletes this. Findings are recorded in
[`docs/plan/05-phase-5-auth-magic-link.md`](docs/plan/05-phase-5-auth-magic-link.md) §0.
