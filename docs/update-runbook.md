# Update runbook

Everything goes through a pull request. CI must be green.

## Refresh data before an election

1. Branch from `main`.
2. Get a new source snapshot:
   - Online: `npm run fetch-source`
   - Or import a browser export: `npm run fetch-source -- --from <path-to-export> --sha256 <hash-you-verified-in-the-browser>`
3. `npm run build-data`. The build refuses a snapshot whose hashes do not match its manifest.
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
2. Fill `election.json`: date, threshold, seats, poll-ban window, polling-station info, source database URLs, active snapshot.
3. Add the id to `elections` in `config/site.json` and set `currentElection`. Keep the old election in the list so the archive works.
4. Fetch a snapshot (previous section), then dry run: `npm run build-data`, `npm run check`, `npm test`, `npm run build`, `npm run test:e2e`, and `docker compose up --build`.
5. CHANGELOG entry (new minor or major version), PR.

## Pre-publish checklist

- [ ] CI green on the PR, `docker build` passes
- [ ] The snapshot hash in the build output matches the one you verified
- [ ] Poll-ban window in `election.json` is correct: during the window no polls are shown anywhere, and the notice required by section 16ה(ח) is displayed where polls would be
- [ ] Election date, threshold and seat count come from `election.json`, not from code
- [ ] Every new statement has a source link, date and level
- [ ] `npm run check` reports no dashes
- [ ] CHANGELOG entry added
- [ ] After deploy: headers verified with the curl commands in `docs/deploy.md`
