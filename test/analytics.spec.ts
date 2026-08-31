import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '..')

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(resolve(repoRoot, dir))) {
    const rel = `${dir}/${entry}`
    if (statSync(resolve(repoRoot, rel)).isDirectory()) out.push(...walk(rel))
    else out.push(rel)
  }
  return out
}

const composable = read('app/composables/useAnalytics.ts')
const plugin = read('app/plugins/analytics.client.ts')
const dwell = read('app/composables/useArchiveDwell.ts')
const compose = read('docker-compose.yml')

/**
 * ADR-006. Analytics is the one subsystem where a bug is invisible — nothing
 * renders, nothing errors, and the numbers are simply wrong or the tracker is
 * simply absent. These are the properties worth pinning.
 */
describe('analytics is never load-bearing', () => {
  it('no-ops when the tracker is absent rather than throwing', () => {
    // Unconfigured, blocked by an extension, or the container is down. All
    // three are normal, and none of them may reach a user.
    expect(composable).toMatch(/if \(!tracker\?\.track\) return/)
    expect(composable).toMatch(/try \{[\s\S]*?\}\s*\n\s*catch \{/)
  })

  it('loads no tracker at all when unconfigured', () => {
    // The committed default is empty, so a fresh clone runs with no analytics
    // and needs no setup (hard rule 2).
    expect(plugin).toMatch(/if \(umamiHost && umamiWebsiteId\)/)

    const config = read('nuxt.config.ts')
    expect(config).toMatch(/umamiHost: ''/)
    expect(config).toMatch(/umamiWebsiteId: ''/)
  })

  it('uses the FUNCTION override form, never a bare payload object', () => {
    /*
     * Verified against Umami 3.3.1: `track({ name, data, url })` is accepted,
     * returns a Promise, and records NOTHING. Only the function form
     * `track(payload => ({ ...payload, url }))` actually overrides the URL.
     * There is no error and no console warning — the event simply is not
     * there, which is indistinguishable from an ad blocker.
     */
    expect(composable).toMatch(/tracker\.track\(payload => \(\{ \.\.\.payload/)
    expect(composable).not.toMatch(/tracker\.track\(\{/)
  })

  it('never awaits a track call', () => {
    // An awaited analytics call puts a third party on the critical path of
    // whatever it is measuring.
    for (const file of [...walk('app/components'), ...walk('app/composables'), ...walk('app/pages'), ...walk('app/plugins')]) {
      expect(read(file), `${file} awaits an analytics call`).not.toMatch(/await\s+track\(/)
    }
  })
})

describe('the tracker has exactly one caller', () => {
  /**
   * Same seam as `usePlaybackSource`: one file knows the vendor, so swapping it
   * is a one-file change. Without this, `window.umami` spreads to every
   * component that ever wanted an event.
   */
  it('nothing outside useAnalytics touches window.umami', () => {
    const offenders = [...walk('app'), ...walk('server')]
      .filter(file => file !== 'app/composables/useAnalytics.ts')
      .filter(file => /\.(ts|vue)$/.test(file))
      .filter(file => /window\s*[.[]\s*['"]?umami/.test(read(file)))

    expect(offenders).toEqual([])
  })

  it('every call site names an event from the typed vocabulary', () => {
    // Parsed from the union block rather than line-by-line: the formatter is
    // entitled to move the `=` and re-indent the members, and a test that
    // breaks on `pnpm lint --fix` is a test nobody keeps.
    const union = composable.slice(
      composable.indexOf('export type AnalyticsEvent'),
      composable.indexOf('export type AnalyticsProps'),
    )
    const declared = [...union.matchAll(/\|\s*'([a-z-]+)'/g)].map(m => m[1]!)
    expect(declared.length).toBeGreaterThanOrEqual(6)

    const used = new Set<string>()
    for (const file of [...walk('app/components'), ...walk('app/composables'), ...walk('app/pages'), ...walk('app/plugins')]) {
      if (file.endsWith('useAnalytics.ts')) continue
      for (const match of read(file).matchAll(/\btrack\(\s*'([^']+)'/g)) used.add(match[1]!)
    }

    expect(used.size).toBeGreaterThan(0)
    for (const event of used) {
      expect(declared, `'${event}' is not in the AnalyticsEvent union`).toContain(event)
    }
  })
})

describe('what analytics must never record', () => {
  /**
   * The analytics database sits outside the cookieless/no-PII story that makes
   * the rest of this need no consent banner. On an archive of documented
   * violence, "which clip did this visitor watch" and "what did they search
   * for" are precisely the records not to keep.
   */
  it('normalises and caps the search term it does record', () => {
    /*
     * The term is recorded on purpose (ADR-006) — the rule is "nothing that
     * ties back to a visitor", not "nothing a visitor typed". These two guards
     * are what keep it a list of terms rather than a pile of junk: without
     * normalisation "Desert" and "desert " are separate rows, and without the
     * cap a pasted paragraph becomes a permanent one.
     */
    const toolbar = read('app/components/archive/ArchiveToolbar.vue')
    expect(toolbar).toMatch(/\.trim\(\)\.toLowerCase\(\)/)
    expect(toolbar).toMatch(/slice\(0, TERM_MAX_LENGTH\)/)
    expect(toolbar).toMatch(/track\('archive-search', \{ term, results/)
  })

  it('does not send the email address with a sign-in event', () => {
    const auth = read('app/components/AuthModal.vue')
    const calls = [...auth.matchAll(/track\('signin-[a-z]+'[^)]*\)/g)].map(m => m[0])
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call, `${call} may carry an address`).not.toMatch(/email/)
    }
  })

  it('keeps session replay off — it is a separate ADR, not a toggle', () => {
    // Phase 7 guardrails name session recording alongside analytics. Umami v3
    // ships a recorder; nothing here may switch it on.
    expect(compose).not.toMatch(/RECORDER|replay/i)
  })
})

describe('archive dwell replaces per-clip events', () => {
  it('is the only archive engagement metric — no clip-played event exists', () => {
    // The feed autoplays, so a per-clip event measures scrolling and explodes
    // in volume. If one is ever added, this is the conversation to have first.
    expect(composable).not.toMatch(/'clip-play|'clip-played|'archive-clip/)
  })

  it('stops the clock when the tab is hidden', () => {
    expect(dwell).toMatch(/document\.hidden/)
    expect(dwell).toMatch(/visibilitychange/)
  })

  it('does not start counting until the advisory is accepted', () => {
    // The archive loads behind the gate (hard rule 15); time spent reading a
    // content warning is not time spent looking at the work.
    expect(dwell).toMatch(/advisory\.accepted\.value/)
  })

  it('sends at most one event per visit', () => {
    // Partial flushes on each hide would double-count anything that sums them.
    expect(dwell).toMatch(/if \(flushed\) return/)
    expect(dwell).toMatch(/flushed = true/)
  })

  it('uses pagehide rather than beforeunload', () => {
    // beforeunload is unreliable in exactly the cases that matter. Matched on
    // the listener rather than the word — the composable names `beforeunload`
    // in a comment saying why it is not used, and that is not a violation.
    expect(dwell).toMatch(/addEventListener\('pagehide'/)
    expect(dwell).not.toMatch(/addEventListener\(\s*'beforeunload'/)
  })

  it('sends a bucket alongside the raw seconds', () => {
    // Umami groups by property value; a free-running integer makes one bucket
    // per visit and charts nothing.
    expect(dwell).toMatch(/bucket: bucketOf\(seconds\)/)
    expect(dwell).toMatch(/seconds,/)
  })
})

describe('the self-hosted stack', () => {
  it('gives Umami its own database, not the Directus one', () => {
    // Directus introspects the database it is pointed at; sharing would put
    // Umami's tables in front of every editor.
    expect(compose).toMatch(/DATABASE_URL:.*\/\$\{UMAMI_DB:-umami\}/)
    expect(compose).not.toMatch(/DATABASE_URL:.*\$\{POSTGRES_DB/)
  })

  it('turns off Umami\'s own phone-home telemetry', () => {
    // Self-hosting analytics to avoid sending data to a third party, then
    // sending data to a third party, would be self-defeating.
    expect(compose).toMatch(/DISABLE_TELEMETRY: '1'/)
  })

  it('creates the Umami database on a fresh volume', () => {
    expect(compose).toContain('/docker-entrypoint-initdb.d')
    const script = read('scripts/postgres/10-umami-db.sh')
    expect(script).toMatch(/CREATE DATABASE/)
    // The trap worth documenting: initdb runs only when the volume is empty.
    expect(script).toMatch(/createdb/)
  })
})
