# Phase 3 — Archive: port, deliver

> **Blocked by:** Phases 1 and 2.
> **Can run in parallel with:** Phase 4 (independent).
> **Size:** ~1 week.
> **Answer needed:** **Q4** — archive inventory.

---

## Goal

The existing video archive player and browser, ported into the new repo, restyled with the
Phase 2 system, playing **public MP4** through CloudFront — built so that swapping to HLS
later is a change in one place.

---

## Port status — recorded 2026-08-26

The player and the search/filter toolbar are ported from pe-vue and working
against the real archive: 30,651 clips, searchable, filterable, playing.

**AWS work is NOT done.** §3.2 (bucket, distribution), §3.4 (faststart audit) and §3.8 (the
HLS trigger) are all outstanding — they need an AWS account this repo does not have.

### What was ported

| From pe-vue | To here | Note |
|---|---|---|
| `VideoPlayer.vue` | `archive/ArchivePlayer.vue` | IntersectionObserver autoplay, centre-of-viewport test, play delay, single-active-player, muted by default |
| `ArchiveToolbar.vue` | `archive/ArchiveToolbar.vue` | Search, bin range, shuffle, bookmarks |
| `BinSelector.vue` | `archive/ArchiveBinSelector.vue` | Contiguous-range selection, behaviour unchanged |
| `VideoFeed.vue` | `archive/ArchiveFeed.vue` | Virtualised feed |
| Vuex `playlist` module | `useArchive()` | Same filters, derived rather than imperatively recomputed |
| `data/edits.js` | `shared/utils/archive.ts` | Shaping only — builds no URLs |

### Dependencies: one added, four dropped

Added **minisearch** (the search index is the feature). Dropped **vuex**, **lodash**,
**immutable** and **vue-virtual-scroller** — `useState` replaces the store, the four lodash
helpers are one-liners, a `Map` is what Immutable stood in for, and the Vue 3 build of the
scroller is still pre-release, so the feed uses a ~40-line window instead. **Font Awesome** is
gone too: six glyphs became inline SVG.

### The S3 problem, and how it is handled

pe-vue points at `aam-purgatory-archive.s3.eu-north-1.amazonaws.com` directly. Hard rule 3
forbids that. But hard rule 2 says a feature that cannot be exercised locally is not done, and
a player with no media is not a port.

So `usePlaybackSource` is the single seam (hard rule 5 — no container format appears anywhere
else, and there is a test for it). It uses `NUXT_PUBLIC_MEDIA_BASE` whenever set. The S3
origin is used **only** behind an explicit `NUXT_PUBLIC_MEDIA_ALLOW_ORIGIN_FALLBACK`, warns
on every load, and shows a banner above the feed. **Setting that flag in a deployed
environment is the bug hard rule 3 is about.**

### Data-quality findings — these are the archive's, not the port's

1. **167 records have an EMPTY `uid`, and three ids are reused** across different clips.
   MiniSearch throws on a duplicate id, and it took down the entire feed rather than the 169
   affected records. `assignStableIds` derives a filename-based id instead of dropping them.
2. **12,433 clips (41%) have no `binCategory` at all.** Any intensity filter necessarily
   excludes all of them. Worth knowing before anyone reads the filtered counts as coverage.
3. **134 clips use bins outside the scale** — `INT` (94) and `Overlay/ Misc` (40). No
   contiguous range over `BINS` can reach them, so they are findable by search and never by
   the intensity filter. Inherited from pe-vue, which filtered the same way.

Both 2 and 3 are recorded as tests against the real export, so a cleaned-up re-export will
show up as a failing test rather than a silent change.

### Deliberate departures from the original

- **`preload="none"`, not `"auto"`.** The original preloaded every mounted clip. Against
  whole-file MP4 egress that is money spent on clips nobody watches — the exact cost ADR-004
  accepted and asked to watch.
- **Bookmarks are localStorage, not PocketBase.** There are no accounts until Phase 5, and
  ADR-002 makes Directus the user store when there are. Wiring a backend now would be building
  the wrong integration twice.
- **Search is always visible** rather than behind a magnifying-glass toggle. On a 30,000-item
  archive it is the primary control.
- **An advisory gate before the feed.** Clips autoplay, and the material is what it is;
  someone should be able to decide not to see it first.
- **A seek bar**, which the original did not have. Keyboard-operable for free.

### Still to do here

- Everything AWS: bucket, CloudFront, faststart audit, the HLS trigger with a named owner.
- The `srcIndex` / source-browsing view (`SrcIndexView.vue`) was not ported — nothing links to
  it yet. `collectSources` already provides the data.
- Galaxy and mobile-specific archive views were not ported.

---

## Decision: MP4 now, HLS later

Serving the existing MP4s directly is the right call for now. Transcoding is deferred work,
not skipped work, and this phase's job is to make deferring it cheap.

**What you gain:** no transcode job, no ladder to tune, no reconciliation script, no waiting
on an ffmpeg run over the whole archive before anything is visible. The archive goes live in
days rather than weeks.

**What you accept, and should understand precisely:**

1. **Whole-file egress.** A progressive MP4 transfers the entire file even when someone
   watches ten seconds and leaves. On an archive people *browse and sample*, most sessions are
   short — so you pay full price for partial views. This is the real cost of the decision, and
   it scales with how casually people browse.

2. **No adaptive bitrate.** One file, one quality, for everyone. A visitor on a phone on
   mobile data gets the same file as someone on fibre. They will experience buffering, and
   there is nothing the player can do about it.

3. **Seeking depends on file structure** — see §3.4, which is the single most important
   practical item in this phase.

**None of this is fatal at small scale**, which is why deferring is reasonable. CloudFront's
always-free tier is 1TB/month — roughly 500 full plays of a 2GB work before you pay anything.

**Write the migration trigger down** (§3.8) so HLS happens on a number rather than on a
feeling.

---

## Two jobs, cleanly separable

**A — Port and restyle the player.** Functionality carries over; presentation does not.
**B — Set up delivery** in AWS.

They share almost nothing. If two people are working, split here. Job B has no dependency on
Phases 1–2 and can start any time.

---

## The porting rule

**Port behaviour. Rewrite presentation. Do not refactor logic.**

The existing player works. Its value is accumulated handling of things that are not obvious
until they bite — buffering states, seek behaviour, format quirks, mobile peculiarities. That
knowledge is in the code.

Bring the logic across as intact as practical, strip the styling to nothing, rebuild appearance
from Phase 2 tokens. Resist improving playback logic while porting: untangling a port bug from
a refactor bug simultaneously is genuinely unpleasant.

---

## Steps

### 3.1 — Inventory (answers Q4)

Before anything: item count, total GB, container and codec per item, resolutions, durations,
and anything unusual — very long, very short, silent, non-standard aspect ratio, monochrome,
variable frame rate.

An artistic archive will have items that break assumptions. Find them now.

**Specifically check, for every file:**

- Is it H.264 + AAC in MP4? Anything else (ProRes, HEVC in an odd container, MKV, VP9) will not
  play universally and needs remuxing or re-encoding.
- **Is the `moov` atom at the front?** See §3.4. Check this for every file — it is the
  difference between a working archive and a broken-feeling one.

### 3.2 — Port the player

Into `app/components/archive/`.

- Bring across playback logic, state handling, format handling.
- **Delete all styling.** Every class, every stylesheet. Rebuild from Phase 2 primitives —
  `Frame` for aspect ratio, tokens for everything visual.
- Composition API and TypeScript **only where mechanical**. A large rewrite here is scope creep.
- Keyboard controls: play/pause, seek, volume, fullscreen. (Hard rule 11 — video players are
  where keyboard support is most often missing.)
- Clean up on unmount: pause, clear `src`, call `load()`, remove listeners. A `<video>` element
  left with a live source keeps buffering after navigation.

### 3.3 — Abstract the source ⚠️

**This is the step that makes the HLS deferral cheap, and it costs almost nothing today.**

Do not let `.mp4` spread through the codebase. Put one composable between the player and the
media URL:

```ts
// app/composables/usePlaybackSource.ts
type PlaybackSource =
  | { type: 'progressive'; url: string }
  | { type: 'hls';         url: string }   // not yet used

export function usePlaybackSource(item: ArchiveItem): PlaybackSource {
  // Today: always progressive.
  // Later: return hls when item.hls_key exists, progressive otherwise —
  // which lets the archive migrate item by item rather than all at once.
  return { type: 'progressive', url: mediaUrl(item.mp4_key) }
}
```

The player branches on `type`: `<video src>` for progressive; attach `hls.js` for HLS.
Only the HLS branch is unimplemented, and it is a stub with a comment.

**Why this matters:** when HLS arrives, the change is this composable plus one branch in the
player — and because it is per-item, you can transcode the ten most-watched works first and
leave the rest as MP4 indefinitely. Without the abstraction, HLS means touching the player, the
browser, the item model, and every URL construction site at once.

Model both `mp4_key` and `hls_key` on the archive item **now**. `hls_key` stays null. Adding a
nullable column later is easy; the point is that the composable's future shape is already
expressible.

### 3.4 — Faststart ⚠️ — do not skip this

An MP4 has a `moov` atom holding the index — durations, keyframe positions, the map the player
needs to seek. Many encoders write it **at the end of the file**.

If it is at the end, the browser must download the entire file before it can play or seek at
all. On a large archive file that is a wait of tens of seconds staring at a blank frame, and it
looks exactly like a broken site.

The fix is a remux, not a re-encode — it takes seconds per file and loses no quality:

```bash
ffmpeg -i input.mp4 -c copy -movflags +faststart output.mp4
```

Check every file and remux any that need it:

```bash
# moov before mdat = good
ffprobe -v trace -i input.mp4 2>&1 | grep -o 'type:.\(moov\|mdat\)' | head -2
```

**Do this before uploading anything.** It is the highest-value hour in this phase, and it is
also why "just serve the MP4s" is not quite zero work.

### 3.5 — Buckets

```
s3://<project>-archive/
  mp4/<item-id>/video.mp4          faststart-verified — served
  source/<item-id>/original.*      masters, if different from the served file
  posters/<item-id>/poster.jpg
  hls/<item-id>/                   empty for now — reserved

s3://<project>-assets/             Directus editor uploads (Phase 4)
```

Directus must **never** be pointed at the archive bucket — it will want to index and thumbnail
what it owns. Directus stores only a key reference.

**Lifecycle:** move `source/` to Glacier Instant Retrieval after 30 days. Keep `mp4/` in
Standard — it is being served.

Keep the masters. When HLS day comes, you transcode from them.

### 3.6 — CloudFront

Public distribution, archive bucket as origin.

- **Origin Access Control**, bucket policy allowing only CloudFront. Verify by requesting an S3
  URL directly — it must fail. Public *through the CDN* is not a public bucket.
- S3 → CloudFront origin transfer is free in-account.
- **Range requests must work.** This is how seeking happens on progressive MP4. Verify
  explicitly:

  ```bash
  curl -r 1000000-1001000 -o /dev/null -w '%{http_code}\n' https://media.example.org/mp4/<id>/video.mp4
  # must return 206, not 200
  ```

  A `200` means ranges are not being served and every seek re-downloads from the start. Check
  the cache policy is not stripping `Range`.
- Long TTL on media (immutable, addressed by item id).
- Correct `Content-Type` (`video/mp4`).
- CORS for the site origin.
- **Compression off** — video is already compressed.
- Put the distribution on a subdomain (`media.example.org`), not the `*.cloudfront.net`
  hostname. Costs nothing now, avoids a migration later.

**No signing, no gating.** The archive is public. (Hard rule 4.)

**Cost guardrail, same session:** set an AWS Budget alarm at a threshold a human agrees. The
design prevents expensive mistakes; the alarm catches what the design missed. With whole-file
egress this matters more than it would with HLS.

### 3.7 — Port the browser and wire up

The archive browsing/listing interface. Same rule: behaviour across, presentation rebuilt.

This is where the site's artistic character shows most, since it is how people encounter the
work. Expect design iteration — build it so iteration is cheap: layout from primitives, no
deeply nested bespoke CSS.

Archive items in Directus: title, description, credits, dates, `mp4_key`, `hls_key` (null),
`poster_key`, duration, plus whatever the work needs. Metadata from Directus, media from
CloudFront, no session anywhere.

**Posters matter more with progressive MP4.** Without one, the player shows nothing until data
arrives. Every item needs a poster.

Consider `preload="metadata"` rather than `preload="auto"` on listing pages — `auto` on a grid
of items starts downloading several whole files at once, which with whole-file egress is
expensive as well as slow.

### 3.8 — Write down the HLS trigger

So the deferral is a decision with an end, not a thing that quietly never happens.

```
Move to HLS when ANY of these is true:

  · CloudFront egress exceeds  $______ / month
  · Monthly bandwidth exceeds  ______ GB
  · Mobile playback complaints reach ______
  · An item over ______ minutes enters the archive

Owner of this check: ______        Review cadence: ______
```

Fill these in with a human. A trigger nobody owns is not a trigger.

When it fires, the work is: transcode from masters, populate `hls_key`, implement the HLS
branch in `usePlaybackSource`. Per-item, so it can be incremental — and §3.3 is what makes that
possible.

---

## Acceptance criteria

- [ ] Every served MP4 verified faststart (`moov` before `mdat`). Any that were not have been
      remuxed.
- [ ] Every file is H.264 + AAC in MP4, or has been remuxed/re-encoded to be.
- [ ] A direct S3 URL returns 403.
- [ ] **Range requests return 206** — verified by curl, not assumed.
- [ ] Seeking works, including far into a long file, without a full re-download.
- [ ] Playback starts promptly — no wait-for-whole-file on any item.
- [ ] Plays on desktop Chrome, desktop Safari, iOS Safari, Android Chrome.
- [ ] Player fully keyboard operable, with visible focus.
- [ ] `usePlaybackSource` exists; **no component references `.mp4` directly**.
- [ ] `hls_key` modelled on the archive item, currently null.
- [ ] Video element cleaned up on unmount — verified in devtools by navigating between ten
      items and watching the network panel go quiet.
- [ ] Listing pages do not eagerly download full videos (`preload="metadata"` or lighter).
- [ ] Every item has a poster.
- [ ] No styling survives from the original implementation.
- [ ] Playback works signed-out, in a private window.
- [ ] AWS Budget alarm configured.
- [ ] HLS trigger written down, with a named owner.
- [ ] The unusual items from §3.1 all play correctly.

---

## Guardrails — out of scope for Phase 3

- **Do not build the HLS pipeline.** Deferred deliberately. Build the seam (§3.3), not the
  implementation.
- **Do not add auth to media.** The archive is public.
- **Do not serve from S3 directly.** Not for testing, not temporarily.
- **Do not add a video SaaS** (Mux, Cloudflare Stream, Bunny Stream). ADR-004 rejected them.
- **Do not refactor player logic while porting.**
- **Do not re-encode** unless a file genuinely cannot play. Remuxing for faststart is a copy,
  not an encode — keep it that way.
- **Do not build DRM, watermarking, or live streaming.**
- **Do not delete masters.**

---

## Record before closing

- Item count / total GB: ______
- Files that needed faststart remuxing: ______
- Files that needed re-encoding, and why: ______
- Measured egress per full playback: ______
- HLS trigger values and owner: ______
- Known player issues deferred from the port: ______
