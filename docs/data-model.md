# Data model

Every file the pipeline reads, what it is for, and which schema in `schemas/` checks it. `scripts/validate-data.ts` picks the schema from the file's path (`schemaFor`), and each data file also names its schema in its `$schema` field. Files under `sources/` are not ours to describe and have no schema, apart from the snapshot `manifest.json`.

For the shape of the generated `site.json` see [architecture.md](architecture.md), section "The site-data contract". This file does not repeat it.

## Overview

| File | Role | Schema |
|---|---|---|
| `config/site.json` | Site version, current election, archive list | `site-config.schema.json` |
| `data/common/*.json` | Text shared by all elections | `common-<name>.schema.json` |
| `data/elections/<id>/election.json` | Facts of one election | `election.schema.json` |
| `data/elections/<id>/content/*.json` | Curated texts and list metadata for one election | `content-<name>.schema.json` |
| `data/elections/<id>/content/*.md` | Curated prose, rendered to HTML | none (Markdown) |
| `data/elections/<id>/coalition/*.json` | Hand-curated coalition statements | `coalition-<name>.schema.json` |
| `data/elections/<id>/sources/snapshots/<date>/` | Verified copy of the source database | `manifest.schema.json` (manifest only) |
| `data/elections/<id>/sources/golden/` | Chunks verified in the browser, used by tests | none |
| `public/data/elections/<id>/site.json` | Generated output, not committed | `site.schema.json` |

Every schema that has a `schemaVersion` field fixes it at `1` (see [migrations.md](migrations.md)). Five content files have no `schemaVersion` field: `home.json`, `pages.json`, `reflect.json`, `results.json`, `tools.json`.

## config/site.json

Schema `site-config.schema.json`.

| Field | Meaning |
|---|---|
| `schemaVersion` | `1` |
| `siteVersion` | Site version, copied into `site.json` as `build.siteVersion` (now `5.0.0`) |
| `currentElection` | Election id the app opens by default |
| `elections` | Every election that has a folder; `build-data` writes one `site.json` per id |
| `storageKeyPrefix` | Prefix for the app's `localStorage` keys |

## data/elections/<id>/election.json

Schema `election.schema.json`. Copied into `site.json` as `election` without changes.

| Field | Meaning |
|---|---|
| `schemaVersion` | `1` |
| `id` | Folder name, for example `2026-knesset-26` |
| `kind` | Kind of election (`knesset`) |
| `knessetNumber` | Number of the Knesset being elected |
| `nameHe` | Hebrew name of the election |
| `dateIso` | Election day, `yyyy-mm-dd` |
| `dayHe` | Election day as Hebrew text |
| `pollsOpen`, `pollsClose` | Opening and closing time of the polling stations, ISO date-time with offset |
| `timezone` | IANA time zone (`Asia/Jerusalem`) |
| `thresholdPct` | Electoral threshold in percent |
| `totalSeats` | Seats in the Knesset |
| `majority` | Seats needed for a majority |
| `minSeatsIfPassed` | Smallest seat count of a list that passed the threshold |
| `pollBan.from`, `pollBan.until` | Window in which no poll numbers are shown in the coalition tab |
| `pollBan.lawRef`, `pollBan.lawUrl` | The law section behind the ban and a link to it |
| `pollBan.sourceNote` | Where the dates come from (optional) |
| `pollingInfo.lookupUrl` | Where a voter finds their polling station |
| `pollingInfo.phones`, `pollingInfo.sms` | Phone numbers and SMS number for polling-station questions |
| `pollingInfo.registerClosed` | Date the voter register closed |
| `source.nameHe`, `source.author` | Name and author of the source database |
| `source.baseUrl` | Base URL of the source site; every evidence link is built from it |
| `source.dataUrl` | URL of the source `data.json` |
| `source.evidencePath`, `source.listPath` | Path templates (`{id}`) for a list's evidence page and list page |
| `source.pollsPath` | Path of the polls page |
| `source.issuePath` | Path template (`{issue}`) for an issue page |
| `snapshot` | Date of the active snapshot folder under `sources/snapshots/`. The build refuses to run without it |
| `listsAllApprovedUrl`, `listsAllApprovedCount` | Report of the approved lists and how many there were (optional) |

## data/elections/<id>/content/

`build-data` puts every `*.json` file here into `site.json` under `content`, keyed by file name without extension. Every `*.md` file is rendered to HTML and keyed `<camelCaseName>Html` (so `method-notes.md` becomes `methodNotesHtml`). `docs/method.md` is rendered the same way as `methodHtml`. Each JSON file is checked by `content-<name>.schema.json`.

| File | Role |
|---|---|
| `questions.json` | The 21 quiz statements in our wording: `id`, `cat`, `title`, `label`, `stmt`, `sourceQuestionId` (the question id in the source database), `issue` (source issue page or `null`). Also `cats` (category texts `t`, `a`, `b`) and `short` (the 10 ids of the short quiz). The build requires exactly 21 questions, each `sourceQuestionId` present in the snapshot and each `cat` defined. Required file |
| `lists.json` | Metadata we curate per list, keyed by list id: `n` name, `l` leader, `cand` candidate list URL, `pl` platform URL or `null`, `pt` platform note, `src` (optional link), `documented` (count of documented candidates), `legal` (criminal proceedings text), `conductCheck` (`total`, `readAt`). Plus `tableReadAt`, `platformsCheckedAt`, `note`. Every list in the snapshot needs an entry. Required file |
| `coalition.json` | Sentences of the coalition tab that belong to this election, with `{{name}}` placeholders; `vars` adds placeholders for `data/common/formation.json` |
| `home.json` | Home view texts: `intro`, `shortDuration`, `longDuration`, `beforeStart` |
| `pages.json` | Page texts: header, countdown, banner after election day, footer, matrix, parties tab, tools tab, "decide" items |
| `reflect.json` | Self-check topics (`id`, `t`, `q`) shown in the full quiz and not scored |
| `results.json` | Election-specific parts of the results view (`economy`) |
| `tools.json` | Other tools listed in the tools tab (`n`, `u`, `d`, `p`, `c`) |
| `method-notes.md` | How the data was copied and checked for this election, and its limits. Placeholders such as `{{quizAsof}}` are filled at render |

Texts in these files are trusted HTML unless the schema says they are escaped on render (`reflect.json`).

## data/elections/<id>/coalition/

Hand-curated statements for the coalition tab, one entry per statement. Each file is checked by `coalition-<name>.schema.json`; the shared definitions (`level`, `source`, `stage`, `cell`, `pmStatement`) live in `coalition-cells.schema.json`. `build-data` checks the same rules again and refuses to build when one fails.

| File | Role |
|---|---|
| `cells.json` | Pair statements: what list `a` said about sitting with list `b`. A pair with no entry is unknown |
| `pm.json` | What list `a` said about a government headed by the head of list `h` |
| `out.json` | What each list said about outside support from the Arab lists (`arab` names them). No date field |
| `lists.json` | Per list: `gov` (the governments it sat in since 2020, shown under "ממשלות מאז 2020"), `cond` (its stated conditions for joining a coalition), `nuance` (extra notes on the list). Each entry is `t` plus `src` |
| `surplus.json` | Surplus-vote agreements (`a`, `b`, `d`, `src`) and `none` (lists reported without one) |
| `scenarios.json` | Ready-made scenarios: `id`, `t`, `lists`, `pm`, `why`, and `srcRule` (which statement backs it: `{pmHead, lv}` or `{cell: [a, b]}`) |
| `meta.json` | `issue` (the source's coalition issue page), `qt` (titles of the four coalition questions), `coalQuestions` (their source question ids) |

### Statement shape

A statement in `cells.json` or `pm.json`:

| Field | Meaning |
|---|---|
| `a` | The list that made the statement |
| `b` (cells) / `h` (pm) | The list it is about, or whose head it is about |
| `lv` | Level, one of the five below |
| `d` | Date of the statement, `yyyy-mm-dd`. Required |
| `t` | What was said, in our words, with the quote |
| `cond` | The condition. Required when `lv` is `C` |
| `src` | One or more sources (forms below). Required |
| `db` | `[question, value]`: the source database value this statement is shown with. The build checks it equals the snapshot |
| `gen` | `true` for a general statement (about "Arab parties", for example) rather than about this list by name |
| `rep` | `true` when it rests on a report, not a direct quote |
| `st` | Stages: earlier statements, each with `lv`, `d`, `t`, `src` and `cond` when `lv` is `C` |

Levels (`LVN` in `src/coalition/logic.ts`):

| `lv` | Shown as | Meaning |
|---|---|---|
| `X` | פוסלת במפורש | Explicitly rules the partner out |
| `C` | פוסלת בתנאי | Rules it out unless a stated condition is met |
| `N` | לא אמרה | Has not said |
| `O` | פתוחה | Open to it |
| `P` | הודיעה על שותפות או המלצה | Announced a partnership or a recommendation |

The app shows `U` (לא ידוע) for a pair with no entry; it is never written in the data.

Source forms, the same in every coalition file:

| Form | Example | Becomes |
|---|---|---|
| Claim id | `"yashar-claim-eisenkot-inss-coalition-2026-07"` | A link to the claim's anchor on the list's evidence page in the source, with the claim's first source link and outlet. The build refuses an id it cannot find on any evidence page in the snapshot |
| Issue path | `"issues/coalition-lines.html"` | A link to the source's coalition issue page |
| External | `{"u": "<url>", "o": "<outlet>", "d": "yyyy-mm-dd"}` | A direct link marked as not from the source database |

### Stages

`st` holds earlier statements by the same list on the same partner. They are shown as a previous stage. The top-level statement is the latest one, and it decides the level of the cell.

## Evidence rules, as data rules

These rules decide what may be written in the coalition files. The method text the site shows (`content/method-notes.md`) states them for readers.

- **No inferred positions.** A level comes only from a statement or an act with a source and a date. Ideology, bloc, or a vote on another subject is not a reason to set `X`, `C`, `O` or `P`. Without such a statement the level is `N`, or there is no entry and the pair is unknown.
- **Only designated speakers count.** A statement counts when it comes from the head of the list, an official announcement, or someone sent to speak for the list. Words of someone who does not head the list today do not set its level. This is why `out.json` has `N` for `utj` and `noam` even where the source database has a value, and `build-data` checks those levels.
- **The later statement decides.** When a list said several things, the latest one is the statement and sets `lv`; earlier ones go into `st`.
- **The database value is shown, not overridden.** `db` must equal the snapshot value. When our level differs from the database scale (it measures a position, our levels measure what was said about partnership), both are shown.
- **Group statements.** A statement about "Arab parties" or "Haredi parties" applies to the lists the source database assigns to that label, and is marked `gen`.

## data/common/

Text that does not change between elections. Each file goes into `site.json` under `content`, keyed by file name.

| File | Role | Schema |
|---|---|---|
| `formation.json` | Government formation: law links (`law`), `surplusIntro`, `stepsTitle`, `steps` (`title`, `html`), `checked`, `checkedNote`, `glossary` (`term`, `html`). Texts are trusted HTML with `{{name}}` placeholders and `[[key\|text]]` links to `law[key]` | `common-formation.schema.json` |

## data/elections/<id>/sources/snapshots/<date>/

A verified copy of the source database. `election.json` `snapshot` names the active folder.

| File | Role |
|---|---|
| `data.json` | The source database as downloaded |
| `evidence-html/<list>-evidence.html.gz` | Each list's evidence page, gzipped |
| `evidence-html.sha256` | SHA-256 of each uncompressed evidence page |
| `manifest.json` | Schema `manifest.schema.json`: `date`, `method`, `fetchedAt`, `sourceBuiltAt`, `sourceVersion`, `note`, `files` (SHA-256 of every file in the folder, `data.json` required) and `evidenceHtmlSha256` (SHA-256 of each uncompressed evidence page) |

`build-data` refuses the snapshot when a listed file is missing, a hash differs, an evidence page is not in the manifest, or a list has no evidence page. Snapshot files are kept byte for byte as downloaded, so the dash check skips `sources/`; the build cleans the text it takes from them and then fails if a forbidden dash reaches `site.json`.

## data/elections/<id>/sources/golden/

Chunks copied from the source in the browser and verified there by SHA-256. They are test inputs, not build inputs.

| Folder | Files | Used by |
|---|---|---|
| `2026-10-17-browser-chunks/` | `meta.json` (list and poll details), `coal.txt` (the four coalition questions, both dimensions), `claims.json` (claim id to page, date, status, link, outlet) | `tests/unit/pipeline/golden.test.ts` proves the pipeline reproduces each one from the 17.10 snapshot |
| `2026-10-16-browser-chunks/` | `out1.json` (quiz cell encodings `V` and party meta `M` from 16.10), `evA.json`, `evB.json` (claim ids per list and question from 16.10) | `golden.test.ts` re-encodes the cells against `out1.json` and expects exactly 3 to differ (see [parity-2026-10-17.md](parity-2026-10-17.md)). No test reads `evA.json` or `evB.json` today |

## public/data/elections/<id>/site.json

Generated by `scripts/build-data.ts`, checked by `site.schema.json`, not committed. The contract is in [architecture.md](architecture.md).
