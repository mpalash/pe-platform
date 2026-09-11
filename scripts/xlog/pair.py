#!/usr/bin/env python3
"""
Pair every Experience Log video with its two session CSVs, and plan the copy.

    pair.py <keys.txt> <spans.tsv> <done-dir> <out-dir>

keys.txt   every key under "Experience Log/", one per line
spans.tsv  <csv key> TAB <first timestamp> TAB <last timestamp>
done-dir   the run's done markers (_xlog-run/done/*.json)
out-dir    receives copies.tsv (<source key> TAB <destination key>) and index.json

── How a CSV finds its video ────────────────────────────────────────────────

Each session writes `…_subjectID_<name>_met.csv` (headset metrics) and
`…_subjectID_<name>_filenames.csv` (clips shown). Every row is timestamped, and
the met file's first row lands within seconds of the time in the video's
filename. Two methods, run independently:

  time  the CSV whose time range CONTAINS the video's start, preferring the
        one that started most recently. "Contains", not "starts just after":
        the headset sometimes logged into one file for hours (the opening
        night's `unregistered participant` file runs 14:00–22:35), and that
        file's session is its tail. "Most recently started" stops such a file
        claiming every other video it happens to span.
  name  same date, and the video's `_<name>` suffix equals the CSV's subject
        id, ignoring case and punctuation (`joha` / `Joha`).

Across 69 sessions where both apply they agree every time. Time alone pairs
the unnamed videos; name alone pairs `VR-14._mitchel`, whose filename lost its
time. If they ever disagree the name wins and the entry is marked `conflict`.

The subject column inside the CSV is not used: it is blank on most rows and
one file can hold several people.
"""
import collections
import datetime as dt
import json
import pathlib
import re
import sys

keys_path, spans_path, done_dir, out_dir = sys.argv[1:5]
out = pathlib.Path(out_dir)

SRC = 'Experience Log/'
DST = 'x_logs/'
SLACK = dt.timedelta(seconds=120)  # a CSV may begin up to 2 min after its video


def parse(s):
    return dt.datetime.strptime(s, '%Y-%m-%d %H:%M:%S')


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def slug_of(key):
    """Must match xlog.sh exactly — it names the folder the video is in."""
    base = key.rsplit('/', 1)[-1].rsplit('.', 1)[0]
    return re.sub(r'[^a-z0-9]+', '-', base.lower()).strip('-')


keys = [k for k in (l.rstrip('\n') for l in open(keys_path)) if k]
spans = {}
for line in open(spans_path):
    k, first, last = line.rstrip('\n').split('\t')
    spans[k] = (parse(first), parse(last))

videos, csvs = [], []
for k in keys:
    b = k.rsplit('/', 1)[-1]
    if m := re.match(r'(\d\d)\.(\d\d)\.(\d\d)-Participant VR-([\d.]*?)(?:_(.*))?\.mov$', b, re.I):
        date = f'20{m[1]}-{m[2]}-{m[3]}'
        t = m[4].rstrip('.')
        start = parse(f'{date} ' + t.replace('.', ':')) if re.fullmatch(r'\d\d\.\d\d\.\d\d', t) else None
        videos.append(dict(key=k, date=date, start=start, name=m[5] or ''))
    elif m := re.match(r'PurgatoryEDIT_(\d{4}-\d\d-\d\d)_subjectID_(.*?)[_.](met|filenames)\.csv$', b, re.I):
        first, last = spans[k]
        csvs.append(dict(key=k, date=m[1], name=m[2], kind=m[3].lower(), first=first, last=last))


def by_time(v, kind):
    if not v['start']:
        return None
    hits = [c for c in csvs if c['kind'] == kind and c['first'] <= v['start'] + SLACK and c['last'] >= v['start']]
    return max(hits, key=lambda c: c['first']) if hits else None


def by_name(v, kind):
    if not v['name']:
        return None
    hits = [c for c in csvs if c['kind'] == kind and c['date'] == v['date'] and norm(c['name']) == norm(v['name'])]
    return hits[0] if len(hits) == 1 else None


done = {}
for f in pathlib.Path(done_dir).glob('*.json'):
    marker = json.loads(f.read_text())
    done[marker['slug']] = marker

copies, items, claimed, conflicts, not_encoded = [], [], collections.Counter(), [], []
for v in videos:
    slug = slug_of(v['key'])
    entry = dict(slug=slug, source=v['key'],
                 recorded=v['start'].strftime('%Y-%m-%d %H:%M:%S') if v['start'] else v['date'])
    for kind in ('met', 'filenames'):
        t, n = by_time(v, kind), by_name(v, kind)
        conflict = bool(t and n and t['key'] != n['key'])
        pick = n if conflict else (t or n)
        if conflict:
            conflicts.append((v['key'], kind, t['key'], n['key']))
        if pick:
            claimed[pick['key']] += 1
            dest = f'{DST}{slug}/{kind}.csv'
            copies.append((pick['key'], dest))
            entry[kind] = dest
            entry[f'{kind}_source'] = pick['key']
            entry[f'{kind}_paired_by'] = 'conflict' if conflict else 'time+name' if (t and n) else 'time' if t else 'name'
        else:
            entry[kind] = None
    if slug in done:
        m = done[slug]
        items.append({**entry, 'duration': m['duration'], 'playlist': m['playlist'], 'poster': m['poster']})
    else:
        not_encoded.append(v['key'])

twice = [k for k, n in claimed.items() if n > 1]
unpaired = sorted((c for c in csvs if c['key'] not in claimed), key=lambda c: c['first'])
for c in unpaired:
    copies.append((c['key'], f"{DST}_unpaired/{c['key'][len(SRC):]}"))

# Refuse rather than publish something quietly wrong.
if twice:
    sys.exit(f'CSV paired with more than one video: {twice}')
if len({slug_of(v['key']) for v in videos}) != len(videos):
    sys.exit('two videos share a slug')

items.sort(key=lambda i: i['recorded'])
index = dict(generated=dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
             count=len(items), items=items,
             unpaired_csvs=[f"{DST}_unpaired/{c['key'][len(SRC):]}" for c in unpaired])
(out / 'index.json').write_text(json.dumps(index, indent=1) + '\n')
(out / 'copies.tsv').write_text(''.join(f'{s}\t{d}\n' for s, d in copies))

both =sum(1 for i in items if i['met'] and i['filenames'])
print(f'videos {len(videos)} · encoded {len(items)} · with both CSVs {both}')
for i in items:
    if not (i['met'] and i['filenames']):
        print(f"  missing {'met' if not i['met'] else ''}{' filenames' if not i['filenames'] else ''}: {i['source']}")
for k in not_encoded:
    print(f'  NOT ENCODED (no done marker): {k}')
for c in conflicts:
    print(f'  CONFLICT — name used: {c}')
print(f'unpaired CSVs → {DST}_unpaired/: {len(unpaired)}')
print(f'copies planned: {len(copies)}')
