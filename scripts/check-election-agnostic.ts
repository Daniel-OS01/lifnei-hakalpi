/* Fails when app code names an election: dates, the threshold, the source domain, a Knesset number phrase, a
   Knesset-numbered source field name (knesset25_...) or a list id. The pipeline core (scripts/lib) is scanned
   for the field name only: its v5 port checks name lists on purpose, but a field it reads must come from election.json.
   Usage: npx tsx scripts/check-election-agnostic.ts [dir]   (default: src with every rule, scripts/lib with the field rule) */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const STUB = "TEMPORARY STUB, replaced at integration";

export function partyIds(root = process.cwd()): string[] {
  const ids = new Set<string>(), base = join(root, "data/elections");
  if (!existsSync(base)) return [];
  for (const e of readdirSync(base)) {
    const snaps = join(base, e, "sources/snapshots");
    if (!existsSync(snaps)) continue;
    for (const s of readdirSync(snaps)) {
      const f = join(snaps, s, "data.json");
      if (existsSync(f)) for (const p of JSON.parse(readFileSync(f, "utf8")).parties ?? []) ids.add(p.id);
    }
  }
  return [...ids];
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
}

const FIELD_RULE: [string, RegExp] = ["Knesset-numbered field name", /knesset\d{2}_/i];

/** fieldsOnly: apply only the Knesset-numbered field name rule (used for scripts/lib). */
export function scan(dir: string, ids: string[], fieldsOnly = false): string[] {
  const rules: [string, RegExp][] = fieldsOnly ? [FIELD_RULE] : [
    FIELD_RULE,
    ["ISO date", /\b\d{4}-\d{2}-\d{2}\b/],
    ["d.m.yyyy date", /\b\d{1,2}\.\d{1,2}\.\d{4}\b/],
    ["threshold", /3\.25/],
    ["source domain", /underwar/],
    ["Knesset number", /כנסת ה-?\d/],
    ...ids.map((id): [string, RegExp] => ["list id " + id, new RegExp("(?<![\\w-])" + id.replace(/[-]/g, "\\-") + "(?![\\w-])")]),
  ];
  const hits: string[] = [];
  for (const f of walk(dir)) {
    const lines = readFileSync(f, "utf8").split("\n");
    if (lines[0].includes(STUB)) continue;
    lines.forEach((l, i) => { for (const [name, re] of rules) if (re.test(l)) hits.push(relative(process.cwd(), f) + ":" + (i + 1) + ": " + name + ": " + l.trim().slice(0, 120)); });
  }
  return hits;
}

if (process.argv[1] && process.argv[1].endsWith("check-election-agnostic.ts")) {
  const ids = partyIds();
  const hits = process.argv[2] ? scan(process.argv[2], ids) : [...scan("src", ids), ...scan("scripts/lib", ids, true)];
  hits.forEach((h) => console.log(h));
  if (hits.length) { console.error(hits.length + " election-specific value(s) in app code"); process.exit(1); }
  console.log("check-election-agnostic: clean");
}
