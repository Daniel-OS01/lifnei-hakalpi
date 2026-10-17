# Architecture

"לפני הקלפי" is a static site. A data pipeline turns a verified snapshot of the source database plus our hand-curated files into one JSON file per election (`site.json`). The browser app reads that file and renders every view. No server code runs at request time.

```
source database (data.json + evidence pages)
        │  scripts/fetch-source.ts   (download, or import a manual browser export)
        ▼
data/elections/<id>/sources/snapshots/<date>/   data.json, evidence-html/*.html.gz, manifest.json (SHA-256 of every file)
        │  scripts/build-data.ts     (verify hashes, refuse on mismatch, extract, merge curated files, validate schemas)
        ▼
public/data/elections/<id>/site.json            (generated, not committed)
        │  vite build
        ▼
dist/  →  nginx in Docker  →  Dokploy
```

## Repository layout

| Path | What lives there |
|---|---|
| `config/site.json` | Site version, the current election id, the list of elections in the archive. Opening a new election means adding a folder and changing `currentElection` here. |
| `data/common/` | Text that does not change between elections: glossary, government-formation steps (law based). |
| `data/elections/<id>/election.json` | Everything specific to one election: date, threshold, seats, poll-ban window, polling-station info, source database URLs, active snapshot. |
| `data/elections/<id>/content/` | Per-election curated content: question paraphrases and categories, list metadata we curate (platform links, legal strings), other tools, page texts, election-specific method notes. |
| `data/elections/<id>/coalition/` | Hand-curated coalition statements (one entry per statement, with level, date, condition, sources). |
| `data/elections/<id>/sources/snapshots/<date>/` | Raw source snapshots with a manifest of SHA-256 hashes. |
| `data/elections/<id>/sources/golden/` | Chunks that were copied from the source in the browser and verified there. Tests prove the pipeline reproduces them. |
| `schemas/` | JSON Schema for every data file. CI validates all data against them. |
| `scripts/` | The pipeline and the repo checks (dash ban, neutrality, mutation proof, link check). |
| `src/` | The app (plain TypeScript, no framework). |
| `tests/unit`, `tests/e2e` | Vitest suites and Playwright render tests. |
| `docs/` | This file, the data model, the method text the site renders, deploy and update runbooks. |

## The site-data contract (`site.json`)

`schemaVersion` 2. Produced only by `scripts/build-data.ts`, validated against `schemas/site.schema.json`.

```ts
interface SiteData {
  schemaVersion: 2;
  build: { builtAt: string; siteVersion: string; snapshot: { date: string; sha256: string; sourceBuiltAt: string } };
  election: Election;            // election.json as is
  quiz: QuizData;                // see below
  coalition: CoalitionData;      // see below
  content: Record<string, unknown> & {
    // every data/elections/<id>/content/*.json file, keyed by file name without extension
    // every content/*.md file and docs/method.md rendered to HTML, keyed "<name>Html"
    // every data/common/*.json file, keyed by file name
    changelog: { version: string; date: string; items: string[] }[];   // parsed from CHANGELOG.md
  };
}
```

`QuizData` keeps the v5 shape: `{ base, asof, srcBuilt, questions[], short[], parties[], cells{pid: Cell[21]}, cats{} }`. A `Cell` is `{ s, a, sl?, al?, si?, ai?, sx?, ax?, g?, su, au, sd?, ad? }` exactly as documented at the top of the v5 `build_data.py`.

`CoalitionData` keeps the v5 `coal.json` shape: `{ asof, srcBuilt, srcVer, srcSha, base, issue, polls, ban, lists[], start{}, cells[], pm[], out{}, arab[], qt{}, cq{}, surplus[], surplusNone, scen[] }`, except that `lists[].prevFaction` (the faction in the outgoing Knesset) was called `k25` in v5.

Keeping both shapes lets the app port stay line-for-line comparable with v5, which is what makes the parity check meaningful.

## Rules the code enforces

- **No election specifics in code.** Dates, thresholds, seat counts, URLs and Hebrew page text come from `site.json`. `scripts/check-election-agnostic.ts` fails CI if `src/` contains a date, the threshold, a list id or a source domain.
- **Time logic in one module** (`src/time.ts`): poll-ban window, countdown, post-election mode. Every function takes `now` as a parameter; tests inject it.
- **Dash ban.** `scripts/check-dashes.ts` fails the build if U+2013, U+2014 or U+2015 appears in `dist/`, `data/`, `docs/` or `src/`.
- **Sources.** The build refuses a coalition statement without a date, a level and at least one source; a conditional refusal without its condition; a database value that differs from the snapshot.
- **Hashes.** The build refuses a snapshot whose files do not match `manifest.json`.
- **Privacy.** No analytics, cookies, external scripts or trackers, and no third-party requests at all: the two fonts (Secular One, IBM Plex Sans Hebrew) are self-hosted through `@fontsource` packages instead of Google Fonts as in v5. State lives in `localStorage`, every access wrapped in try/catch.

## Archive

`config/site.json` lists every election that has a folder. The app loads `?e=<id>` (default: `currentElection`) and shows an archive switch in the footer. After election day the time module switches to post-election mode, and the site keeps working read-only for that election.
