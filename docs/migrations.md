# Schema migrations

How the data schemas in `schemas/` are versioned, and a log of every change.

## Policy

- The generated `site.json` carries `schemaVersion: 2`. The app reads that shape; see [architecture.md](architecture.md) for the contract.
- Every schema that has a `schemaVersion` property fixes it with a `"const"` (1 until the schema first changes), and every data file it covers writes that value. That `const` is the schema's version note. Five content schemas (`content-home`, `content-pages`, `content-reflect`, `content-results`, `content-tools`) have no `schemaVersion` property; for them the entry in this file is the only version record.
- A change to a schema is any change that makes a file valid that was invalid before, or the other way round: a new field, a removed field, a new required field, a changed type, enum or pattern.
- A schema change does three things in the same commit:
  1. Raises the version note in the changed schema file (`schemaVersion` `const` to the next integer) and updates `schemaVersion` in every data file it covers. A schema without the property gets one when it first changes.
  2. Migrates the data files so `npm run check` passes.
  3. Adds an entry to the log below.
- A change to `site.schema.json` also raises `schemaVersion` in `scripts/build-data.ts` and in the app's type, so an old app never reads a new file by mistake.
- Changes that only edit text (titles, descriptions) are not schema changes and need no entry.

Each entry gives: date, schema, change, how to migrate data, and the site version (`config/site.json` `siteVersion`) that first ships it.

## Log

| Date | Schema | Change | How to migrate data | Site version |
|---|---|---|---|---|
| 2026-10-17 | all schemas | Initial version 1 | Nothing to migrate: the data files were written for version 1 | 5.0.0 |
| 2026-10-17 | `election.schema.json` | Version 2. New required `source.fields.prevFaction`: the name of the source `data.json` party field that holds the faction in the outgoing Knesset, so the build no longer names a Knesset number in code | Set `"schemaVersion": 2` and add `"fields": { "prevFaction": "<field name>" }` under `source` (`knesset25_faction_he` for the 26th Knesset) | 5.0.0 |
| 2026-10-17 | `election.schema.json` | Version 3. New required `snapshotSha256`: SHA-256 of the active snapshot's `data.json` (64 hex digits); `build-data` refuses a snapshot whose `data.json` hashes differently | Set `"schemaVersion": 3` and add `"snapshotSha256"` next to `snapshot`, copied from that snapshot's `manifest.json` `files["data.json"]` after checking it with `sha256sum` (`npm run fetch-source -- --activate` writes both fields) | 5.0.0 |
| 2026-10-17 | `site.schema.json` | Version 2. `coalition.lists[].k25` renamed to `prevFaction` (required, same type) | Generated file: rebuild with `npm run build-data`. `scripts/build-data.ts` and `src/types.ts` write and read `schemaVersion: 2` | 5.0.0 |
