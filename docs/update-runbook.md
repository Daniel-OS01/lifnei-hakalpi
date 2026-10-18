# Update runbook

Everything goes through a pull request. CI must be green.

## Refresh data before an election

1. Branch from `main`.
2. Get a new source snapshot and activate it:
   - Online: `npm run fetch-source -- --activate`
   - Or import a browser export: `npm run fetch-source -- --from <path-to-export> --sha256 <hash-you-verified-in-the-browser> --activate`
   - `--activate` writes the snapshot date into `election.json` `snapshot` and its `data.json` SHA-256 into `snapshotSha256`. Without it the snapshot is stored but not used; to activate one by hand, set both fields, taking the hash from `sha256sum data.json` and checking it equals `files["data.json"]` in its `manifest.json`.
3. `npm run build-data`. The build refuses a snapshot whose hashes do not match its manifest, or whose `data.json` does not match `election.json` `snapshotSha256`.
4. Read the parity and diff output. Every changed value should have an explanation. Unexpected changes: stop and find the cause.
5. `npm run check && npm test && npm run build`.
6. Add an entry to `CHANGELOG.md`: a new heading `## [x.y.z] - YYYY-MM-DD` (patch version for a data refresh) with `- item` lines naming the snapshot date and what changed.
7. Open a PR using the data checklist. Merge, then confirm the deployment (see `docs/deploy.md`).

## Add a statement

1. Edit the coalition JSON under `data/elections/<id>/coalition/`. Each entry needs a `level`, a `date`, at least one `source` URL, and, for a conditional refusal, its `condition`.
2. `npm run check && npm test`. The build refuses a statement without a date, a level or a source.
3. No long dashes in any text. CHANGELOG entry, PR.

## Open the next election

1. Copy the folder skeleton of the previous election to `data/elections/<new-id>/`.
2. Fill `election.json`: date, threshold, seats, poll-ban window, polling-station info, source database URLs, `source.fields.prevFaction` (the source field with each list's faction in the outgoing Knesset), active snapshot (`snapshot` and `snapshotSha256`, written by `fetch-source --activate`).
3. Add the id to `elections` in `config/site.json` and set `currentElection`. Keep the old election in the list so the archive works.
4. Rewrite the copied texts. The views build every number, date and threshold from `election.json`, but the per-election editorial files are copied as they were: `content/*.json`, `content/method-notes.md`, `content/lists.json` and all of `coalition/`. Search them for the old year and Knesset number. `data/common/formation.json` is shared: it names the 26th Knesset in the rotation entry because the law does; change it only if the law changes.
5. `tests/unit/app/next-election.test.ts` already proves the code side: it copies the data to a temp folder, adds a dummy 2030 election, changes only `config/site.json`, builds and renders every view.
6. Fetch a snapshot (previous section), then dry run: `npm run build-data`, `npm run check`, `npm test`, `npm run build`, `npm run test:e2e`, and `docker compose up --build`.
7. CHANGELOG entry (new minor or major version), PR.

## Pre-publish checklist

- [ ] CI green on the PR, including the `docker compose up` health and header check
- [ ] The snapshot hash in the build output matches the one you verified
- [ ] Poll-ban window in `election.json` is correct: during the window the coalition tab loads no poll numbers, and wherever earlier polls are still shown (the lists tab) the notice required by section 16ה(ח) and the "published before the ban" label appear
- [ ] Election date, threshold and seat count come from `election.json`, not from code
- [ ] Every new statement has a source link, date and level
- [ ] `npm run check` reports no dashes
- [ ] CHANGELOG entry added
- [ ] After deploy: headers verified with the curl commands in `docs/deploy.md`
