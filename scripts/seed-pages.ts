/**
 * Seeds the five real pages from the existing site's content.
 *
 *   pnpm seed:pages
 *
 * This is Phase 4 §4.9 — "build at least five real pages with intended content,
 * including the most structurally awkward one you can think of". The copy is
 * the project's own, taken from pe-vue/src/md/, not lorem ipsum. That is the
 * whole point: placeholder text cannot tell you the block set is wrong.
 *
 * Idempotent by slug: re-running replaces a page's blocks rather than
 * duplicating it, so it is safe to iterate on the model and re-seed.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

loadDotEnv(resolve(repoRoot, '.env'))

const directusUrl = (process.env['NUXT_DIRECTUS_URL'] ?? 'http://localhost:8055').replace(/\/$/, '')
const serviceToken = process.env['NUXT_DIRECTUS_SERVICE_TOKEN'] ?? ''

function loadDotEnv(path: string): void {
  if (!existsSync(path)) return
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!(key in process.env)) process.env[key] = line.slice(eq + 1).trim()
  }
}

async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${directusUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  if (response.status === 204) return undefined as T

  const body = await response.json().catch(() => ({})) as {
    data?: T
    errors?: Array<{ message: string }>
  }

  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status}: ${body.errors?.[0]?.message}`)
  }

  return body.data as T
}

/* ── block builders ──────────────────────────────────────────────────────── */

type Block = { collection: string, item: Record<string, unknown> }

const richtext = (body: string, opts: { title?: string, anchor?: string } = {}): Block => ({
  collection: 'block_richtext',
  item: { title: opts.title ?? null, anchor: opts.anchor ?? null, body },
})

const media = (item: Record<string, unknown>): Block => ({ collection: 'block_media', item })
/*
 * No page uses block_logos any more — the home page's supporters moved to
 * block_marquee. The collection and its component are left in place rather than
 * deleted: it is a working static-grid alternative and removing a Directus
 * collection destroys data. Worth a deliberate decision either way.
 */
const marquee = (item: Record<string, unknown>): Block => ({ collection: 'block_marquee', item })
const people = (item: Record<string, unknown>): Block => ({ collection: 'block_people', item })
const faq = (item: Record<string, unknown>): Block => ({ collection: 'block_faq', item })
const advisory = (item: Record<string, unknown>): Block => ({ collection: 'block_advisory', item })

/* ── the content ─────────────────────────────────────────────────────────── */

const DEPICTED_CONTENT
  = 'scenes of war, scenes portraying aftermath of war, excessive gore, genocide, aftermath of '
    + 'genocide, body death, blood, heavy bleeding, use of weaponry such as gunfire, missile '
    + 'launches, missile strikes on civilian targets, bombing, explosions, post-explosion debris, '
    + 'demolitions, blast mining, ecocide, weapons of mass destruction, nuclear bombing, nuclear '
    + 'testing and its aftermath, military demonstrations and parades, active military '
    + 'representation, military engagements, depictions of military equipment, scenes of light and '
    + 'heavy conflict, skirmishes, annihilation, drones, artillery, tanks, missile launchers, '
    + 'propaganda and counter-propaganda, hate speech, riots, protests, police brutality, public '
    + 'lynching, mob violence, violent protest, police violence, protestor–police confrontation, '
    + 'destruction of property, stun grenades, live ammunition, smoke bombs, water cannons, '
    + 'molotovs, economic violence, denigration of human rights, disregard of non-human rights, '
    + 'aftermath of cataclysmic disasters, global warming, melting glaciers, volcanic eruption, '
    + 'forest fires, fatal heatwaves, vehicular accidents, nuclear meltdowns, space launch '
    + 'disasters, floods, landfill, marine pollution, marine life death, animal slaughter, meat '
    + 'industry processes, epidemics, pandemics, ecological violence, interpersonal violence, '
    + 'misrepresentation of CRIP and LGBTQ+ people, misrepresentation of disability, prisoners of '
    + 'war, domestic abuse, assassinations, hand-to-hand combat, racism, xenophobia, institutional '
    + 'oppression, hate crimes, acid attacks, blackface, racial attacks, child marriage, arson, '
    + 'homicide, exploitation of the working class, labour in subhuman conditions, entropy and '
    + 'decay, ruins, debris, institutional poverty, concentration camps, historical sites of '
    + 'genocide, refugee camps, detention centres, graveyards, mass graves, memorials, prisons, '
    + 'human and non-human corpses, animal cruelty, cosmic destruction, imploding celestial '
    + 'bodies, collapsing black holes.'

interface PageSpec {
  slug: string
  title: string
  summary?: string
  parentSlug?: string
  blocks: Block[]
}

const PAGES: PageSpec[] = [
  /* ── Landing ───────────────────────────────────────────────────────────── */
  {
    slug: '',
    title: 'purgatory EDIT',
    summary:
      'A user-generated montage-based VR experience and cinematic installation, built on an '
      + 'archive of moving images representative of histories of violence.',
    blocks: [
      richtext(
        '<p>At the core of the project is an archive of moving images representative of histories '
        + 'of violence, a visual semiotic research and analysis process, and an immersive '
        + 'participation-driven Cyber Performance.</p>'
        + '<p>It invites participants to use a created brain interface to investigate a media '
        + 'archive of conflict and violence through their own emotional, neurological and '
        + 'cognitive agency. Through this engagement, participants facilitate the generating of '
        + 'peer-to-peer prompts, where participants and the digital software-as-artwork create '
        + 'metabolic data as cybernetic feedback loops that circulate and cement '
        + 'human-machine-algorithmic knowledges and biases.</p>'
        + '<p>In times where violence, conflict, and trauma are normalised as everyday happenings, '
        + '<em>purgatory</em> <strong>EDIT</strong> performs the task of critical storytelling.</p>',
      ),
      /*
       * Supporters run as marquees rather than static grids.
       *
       * Directions alternate so the four rows read as a moving credits wall
       * instead of four independent tickers pulling the eye the same way.
       * Under prefers-reduced-motion every one of these lays out as a plain
       * wrapping row — see BlockMarquee.
       */
      marquee({
        title: 'Funding support',
        anchor: 'funding',
        speed: 'slow',
        direction: 'left',
        items: [
          { name: 'TAIKE', url: 'https://www.taike.fi/' },
          { name: 'Kone Foundation', url: 'https://koneensaatio.fi/' },
          { name: 'EU Creative Media', url: 'https://culture.ec.europa.eu/' },
          { name: 'Finnland Institut', url: 'https://finnland-institut.de/' },
          { name: 'Goethe Institut', url: 'https://www.goethe.de/' },
        ],
      }),
      marquee({
        title: 'Development support',
        anchor: 'development',
        speed: 'slow',
        direction: 'right',
        items: [
          { name: 'EMAP', url: 'https://emap.eu/' },
          { name: 'Werkleitz', url: 'https://werkleitz.de/' },
          { name: 'Whistling Woods International', url: 'https://www.whistlingwoods.net/' },
          { name: 'CAD+SR', url: 'https://cadplussr.org/' },
        ],
      }),
      marquee({
        title: 'Exhibition support',
        anchor: 'exhibition',
        speed: 'slow',
        direction: 'left',
        items: [
          { name: 'Transmediale', url: 'https://transmediale.de/' },
          { name: 'Project 88', url: 'https://project88.in/' },
          { name: 'Silent Green', url: 'https://silent-green.net/' },
        ],
      }),
      marquee({
        title: 'Technical support',
        anchor: 'technical',
        speed: 'slow',
        direction: 'right',
        items: [
          { name: 'EMOTIV', url: 'https://www.emotiv.com/' },
          { name: 'VITURE', url: 'https://www.viture.com/' },
          { name: 'VDMX', url: 'https://vidvox.net/' },
          { name: 'Vuo', url: 'https://vuo.org/' },
        ],
      }),
    ],
  },

  /* ── The awkward one ───────────────────────────────────────────────────── */
  {
    slug: 'about',
    title: 'About',
    summary:
      'Inspiration, the Doomscroll Archive, analysis research, the Cyber Performance, '
      + 'installation design, and the people behind the project.',
    blocks: [
      richtext(
        '<p><em>purgatory</em> <strong>EDIT</strong> is a user-generated montage-based VR '
        + 'experience and cinematic installation. By critiquing the methods of depiction and the '
        + 'existing glorification of violence in popular culture, its metanarratives open the '
        + 'floodgates of abject knowledge(s) and distil the representation of overlooked bodies, '
        + 'data, networks, and ecologies.</p>',
      ),
      richtext(
        '<blockquote><p>In the film, Dr Brodsky of the Ludovico medical facility forces Alex to '
        + 'watch violent images for extended periods of time as his eyes are held open with '
        + 'specula. He is pumped with nausea-, paralysis- and fear-inducing drugs at the same '
        + 'time, with the objective being the development of a nauseous association when '
        + 'experiencing or thinking about violence, causing an aversion.</p></blockquote>'
        + '<p>The Ludovico technique is the project\'s point of departure — not as a method to '
        + 'reproduce, but as a question about what sustained exposure to depicted violence does to '
        + 'the person watching, and who decides that it should.</p>',
        { title: 'Inspiration', anchor: 'inspiration' },
      ),
      richtext(
        '<p>The Doomscroll Archive currently holds more than 30,000 published clips, excerpted '
        + 'from around 800 source files — close to 2,000 hours of video. The archive proliferates '
        + 'quickly enough that any precise description of its current state is provisional.</p>'
        + '<p>Material is drawn from documented recordings of actual events, or of events based on '
        + 'actual events. The archive is public.</p>',
        { title: 'The Doomscroll Archive', anchor: 'the-doomscroll-archive' },
      ),
      richtext(
        '<p>The research strand has three parts:</p>'
        + '<ol><li>Creating a Violence Intensity Map.</li>'
        + '<li>Categorising the types of violence represented in the archive.</li>'
        + '<li>Collaborating with neuroscientists and cognitive behaviour analysts.</li></ol>'
        + '<p>Each is a way of making explicit a judgement that is otherwise made silently — by an '
        + 'editor, by a platform, or by an algorithm.</p>',
        { title: 'Analysis research', anchor: 'analysis-research' },
      ),
      media({
        // The real URL from the current site, on purpose. block_media refuses a
        // direct S3 link rather than rendering it, so this doubles as a live
        // demonstration that hard rule 3 is enforced rather than merely written
        // down — and as a visible reminder that Phase 3 owes this file a CDN.
        video_url: 'https://aam-purgatory-archive.s3.eu-north-1.amazonaws.com/static/performance-mockup.mp4',
        caption:
          'Cyber Performance, installation mockup. Not shown: the source is a direct S3 URL, and '
          + 'archive media must be served through CloudFront (hard rule 3). Phase 3 moves it.',
        ratio: '16 / 9',
        display: 'bleed',
        anchor: 'cyber-performance',
      }),
      richtext(
        '<p>The installation occupies three spaces.</p>'
        + '<p><strong>Primary space</strong> — the participant, the brain interface, and the '
        + 'montage they generate. <strong>Secondary space</strong> — the audience, watching both '
        + 'the montage and the participant. <strong>Tertiary space</strong> — the archive itself, '
        + 'browsable, public, and indifferent to whether anyone is performing.</p>',
        { title: 'Installation', anchor: 'installation' },
      ),
      people({
        title: 'Team',
        anchor: 'team',
        people: [
          { name: 'Ali Akbar Mehta', role: 'Artist, Researcher & Archivist', url: 'https://aliakbarmehta.com/' },
          { name: 'Jernej Čuček Gerbec', role: 'VDMX programming & Software developer', url: 'https://cucekgerbec.eu/jernej' },
          { name: 'Palash Mukhopadhyay', role: 'UX & Digital Product Design', url: 'https://mpalash.com/' },
          { name: 'Pruthu Parab', role: 'Sound design and additional score' },
          { name: 'Anoushkaa Bhatnagar', role: 'Arts Manager and Producer' },
          { name: 'Sanyam Varun', role: 'Archive manager & Research assistant' },
        ],
      }),
      people({
        title: 'Institutional collaborators',
        anchor: 'collaborators',
        people: [
          { name: 'EMAP / EMARE', role: 'European Media Art Platform' },
          { name: 'Werkleitz', role: 'Residency and production' },
          { name: 'CAD+SR', role: 'Critical practice and research' },
        ],
      }),
    ],
  },

  /* ── Editorial ─────────────────────────────────────────────────────────── */
  {
    slug: 'research',
    title: 'Research logs',
    summary: 'Software development, the six performance metrics, and the bin categorisation index.',
    blocks: [
      richtext(
        '<p><em>purgatory</em> <strong>EDIT</strong> uses the Emotiv Epoc X, a portable EEG kit '
        + 'widely used in academic and scientific research to read brainwave activity as emotions. '
        + 'Its Brain Control Interface broadcasts these as OSC signals on a secure channel.</p>'
        + '<p>Proprietary software developed by the team on top of a licensed VDMX5 receives the '
        + 'broadcast signal and translates those emotional mind-states into parameters linked to '
        + 'the intensity map values.</p>',
        { title: 'Software development', anchor: 'software-dev' },
      ),
      richtext(
        '<p>The brainware reads a user\'s semi-conscious mind-state and outputs it as six '
        + 'metrics:</p>'
        + '<dl>'
        + '<dt>Focus</dt><dd>Fixed attention to one specific task. Measures both the depth of '
        + 'attention and how often attention switches between tasks.</dd>'
        + '<dt>Engagement</dt><dd>Alertness and the conscious direction of attention towards '
        + 'task-relevant stimuli. Contrasts with boredom.</dd>'
        + '<dt>Interest</dt><dd>The degree of attraction or aversion to the current stimuli.</dd>'
        + '<dt>Excitement</dt><dd>Physiological arousal — activation in the sympathetic nervous '
        + 'system, reflected over periods as short as several seconds.</dd>'
        + '<dt>Stress</dt><dd>A measure of comfort with the current challenge.</dd>'
        + '<dt>Relaxation</dt><dd>The ability to switch off and recover from intense '
        + 'concentration.</dd>'
        + '</dl>',
        { title: 'The six metrics', anchor: 'metrics' },
      ),
    ],
  },

  /* ── Reference ─────────────────────────────────────────────────────────── */
  {
    slug: 'faqs',
    title: 'Frequently asked questions',
    summary: 'General questions, the archive, the performance, and how to contribute.',
    blocks: [
      faq({
        title: 'General',
        anchor: 'general',
        items: [
          {
            question: 'What is purgatory EDIT?',
            answer:
              '<p>A user-generated montage-based cinematic experience. It comprises three core '
              + 'strands: the Doomscroll Archive, analysis research, and the Cyber Performance.</p>',
          },
          {
            question: 'How is the project developed?',
            answer:
              '<p>Through multiple stages — compiling the archive, generating the online database '
              + 'and archive, conducting semiotic research and analysis, software development, and '
              + 'exhibition design and installation.</p>',
          },
          {
            question: 'Who administers purgatory EDIT?',
            answer: '<p>Currently, members of the core team. See the About page.</p>',
          },
        ],
      }),
      faq({
        title: 'Archive',
        anchor: 'archive',
        items: [
          {
            question: 'What is currently in the archive?',
            answer:
              '<p>More than 30,000 published clips, excerpted from around 800 source files — close '
              + 'to 2,000 hours of video. The archive proliferates quickly, so any precise '
              + 'description of its current state is provisional.</p>',
          },
          {
            question: 'Is the archive public?',
            answer:
              '<p>Yes. There is no sign-in, no gating, and no signed URLs on any archive '
              + 'material.</p>',
          },
        ],
      }),
      faq({
        title: 'Contributing',
        anchor: 'contributing',
        items: [
          {
            question: 'Can I contribute footage?',
            answer:
              '<p>Contribution is handled case by case through the team. Copyright for material in '
              + 'the archive is Common Use and must be presented with credits.</p>',
          },
        ],
      }),
    ],
  },

  /* ── Legal / advisory ──────────────────────────────────────────────────── */
  {
    slug: 'disclaimers',
    title: 'Disclaimers',
    summary: 'Medical, copyright, and visual advisories for the performance and the archive.',
    blocks: [
      richtext(
        '<ul>'
        + '<li>The <em>purgatory</em> <strong>EDIT</strong> performance is safe to participate in, '
        + 'and there are no medical or other physical side-effects experienced by participants.</li>'
        + '<li>The Emotiv EPOC X is a verified EEG machine widely used in academic research. EMOTIV '
        + 'products are intended for research and personal use only, and are <strong>not sold as '
        + 'medical devices</strong> as defined in EU directive 93/42/EEC. They are not designed or '
        + 'intended for the diagnosis or treatment of disease.</li>'
        + '</ul>',
        { title: 'Medical disclaimer', anchor: 'medical' },
      ),
      richtext(
        '<ul>'
        + '<li>Copyright pertaining to participant-generated bioinformatic data is the sole '
        + 'property of the participant.</li>'
        + '<li>Copyright pertaining to media archived in The Doomscroll Archive, and used for the '
        + 'participatory performance, is Common Use and must be presented with credits.</li>'
        + '</ul>',
        { title: 'Copyright disclaimer', anchor: 'copyright' },
      ),
      advisory({
        title: 'Visual disclaimer & advisory',
        anchor: 'visual',
        severity: 'advisory',
        body:
          '<p>The material used in the work consists of documented recordings of actual events, or '
          + 'of events based on actual events. A majority of the characters appearing in this work '
          + 'are real. Resemblance to actual events, or to persons living or dead, is not '
          + 'coincidental, unintentional, or the result of chance.</p>'
          + '<p>The work as a whole does not constitute, represent, or claim to be a factual '
          + 'depiction of any events or incidents, or of the personal history of any specific '
          + 'individual. It is not intended to defame, slander, or be disrespectful to any person, '
          + 'place, region, country, religion, community, institution, nationality, profession, '
          + 'class, gender, or caste.</p>'
          + '<p>The subject matter may be sensitive for certain audiences. Viewers are advised to '
          + 'exercise discretion as appropriate.</p>',
        detail_label: 'Show the full list of depicted content',
        detail: DEPICTED_CONTENT,
      }),
    ],
  },
]

/* ── seeding ─────────────────────────────────────────────────────────────── */

async function findPage(slug: string): Promise<{ id: string } | undefined> {
  // The home page's slug is the empty string, and Directus rejects `_eq` against
  // one — `_empty` is the operator it wants, and it also matches null.
  const filter = slug === ''
    ? 'filter[slug][_empty]=true'
    : `filter[slug][_eq]=${encodeURIComponent(slug)}`

  const found = await api<Array<{ id: string }>>(`/items/pages?${filter}&limit=1&fields=id`)
  return found[0]
}

async function seed(spec: PageSpec, sort: number): Promise<void> {
  const existing = await findPage(spec.slug)

  // Blocks are created first, then attached — the M2A junction needs real ids.
  const created: Array<{ collection: string, item: string, sort: number }> = []

  for (const [index, block] of spec.blocks.entries()) {
    const item = await api<{ id: string }>(`/items/${block.collection}`, {
      method: 'POST',
      body: JSON.stringify(block.item),
    })
    created.push({ collection: block.collection, item: item.id, sort: index })
  }

  const parent = spec.parentSlug ? (await findPage(spec.parentSlug))?.id ?? null : null

  const payload = {
    status: 'published',
    title: spec.title,
    slug: spec.slug,
    sort,
    summary: spec.summary ?? null,
    parent,
    blocks: created,
  }

  if (existing) {
    // Replacing `blocks` wholesale drops the old junction rows; the orphaned
    // block items are harmless in a seed and would be a real cleanup concern
    // only if editors worked this way, which they do not.
    await api(`/items/pages/${existing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    console.log(`  ~ ${spec.slug || '(home)'} — ${spec.blocks.length} blocks`)
  }
  else {
    await api('/items/pages', { method: 'POST', body: JSON.stringify(payload) })
    console.log(`  + ${spec.slug || '(home)'} — ${spec.blocks.length} blocks`)
  }
}

async function main(): Promise<void> {
  if (!serviceToken) {
    console.error('\n✗ NUXT_DIRECTUS_SERVICE_TOKEN is not set.\n')
    process.exit(1)
  }

  console.log('\nSeeding pages')
  for (const [index, spec] of PAGES.entries()) {
    await seed(spec, index)
  }

  // One draft, so the "unauthenticated request for a draft returns 404" check
  // in §4.7 has something real to be tested against.
  if (!(await findPage('unpublished-draft'))) {
    await api('/items/pages', {
      method: 'POST',
      body: JSON.stringify({
        status: 'draft',
        title: 'Unpublished draft',
        slug: 'unpublished-draft',
        sort: 99,
        summary: 'Exists only so the permissions check has something to fail against.',
      }),
    })
    console.log('  + unpublished-draft (draft, deliberately)')
  }

  console.log('\n✓ Pages seeded.\n')
}

await main()
