// Takes a snapshot of the source database into data/elections/<id>/sources/snapshots/<date>/.
//
//   tsx scripts/fetch-source.ts [--election <id>] [--date YYYY-MM-DD] [--activate]
//       downloads election.source.dataUrl and every party's evidence page (method "auto")
//   tsx scripts/fetch-source.ts --from <dir> [--sha256 <hex>] [--election <id>] [--date YYYY-MM-DD] [--activate]
//       imports a manual browser export: <dir>/data.json and <dir>/<party id>-evidence.html
//       (method "manual-browser-export"); with --sha256 it refuses unless data.json has that hash
//
// The snapshot is written to a temporary folder next to its final place, verified with the same
// loadSnapshot that build-data uses, and only then renamed into place. An existing snapshot is never
// overwritten. --activate writes the new date into election.json "snapshot" and its data.json SHA-256 into "snapshotSha256".
// Data root defaults to the repository; LH_DATA_ROOT points it at another tree (used by tests).
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { fail, loadSnapshot, readJson, sha256 } from "./lib/pipeline.ts";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface FetchOptions {
  election?: string;
  from?: string;
  sha256?: string;
  activate?: boolean;
  date?: string;
  /** Clock for fetchedAt and the default date; tests inject it. */
  now?: Date;
}

export function parseArgs(argv: string[]): FetchOptions {
  const o: FetchOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) fail(`${a} needs a value`);
      return v;
    };
    if (a === "--election") o.election = val();
    else if (a === "--from") o.from = val();
    else if (a === "--sha256") o.sha256 = val().toLowerCase();
    else if (a === "--date") o.date = val();
    else if (a === "--activate") o.activate = true;
    else fail(`unknown argument ${a}`);
  }
  if (o.sha256 && !o.from) fail("--sha256 applies to --from only");
  if (o.sha256 && !/^[0-9a-f]{64}$/.test(o.sha256)) fail("--sha256 must be 64 hex digits");
  if (o.date && !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) fail("--date must be YYYY-MM-DD");
  return o;
}

/** The calendar date in the election's time zone (a snapshot taken in Israel at 01:00 carries that day). */
const localDate = (now: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) fail(`download failed: ${url} answered ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function partyIds(raw: Buffer, where: string): string[] {
  let data: { parties?: { id?: unknown }[] };
  try {
    data = JSON.parse(raw.toString("utf8"));
  } catch (e) {
    fail(`${where} is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(data.parties) || data.parties.length === 0) fail(`${where} has no parties`);
  return data.parties.map((p, i) => {
    if (typeof p.id !== "string" || !/^[a-z0-9-]+$/.test(p.id)) fail(`${where}: party ${i} has no usable id`);
    return p.id;
  });
}

/** Write a snapshot folder in the manifest.json format, verify it with loadSnapshot, move it into place. */
function writeSnapshot(dir: string, raw: Buffer, pages: Record<string, Buffer>, method: string, now: Date, note: string): string {
  if (existsSync(dir)) fail(`snapshot ${dir} already exists; refusing to overwrite it`);
  const tmp = `${dir}.partial-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, "evidence-html"), { recursive: true });
  try {
    const files: Record<string, string> = {};
    const evSha: Record<string, string> = {};
    writeFileSync(join(tmp, "data.json"), raw);
    files["data.json"] = sha256(raw);
    for (const pid of Object.keys(pages).sort()) {
      const name = `${pid}-evidence.html`;
      // Node writes a gzip header with mtime 0, so the same page always gives the same bytes.
      const gz = gzipSync(pages[pid], { level: 9 });
      writeFileSync(join(tmp, "evidence-html", `${name}.gz`), gz);
      files[`evidence-html/${name}.gz`] = sha256(gz);
      evSha[name] = sha256(pages[pid]);
    }
    const list = Object.entries(evSha).map(([n, h]) => `${h}  ${n}\n`).join("");
    writeFileSync(join(tmp, "evidence-html.sha256"), list);
    files["evidence-html.sha256"] = sha256(list);
    const data = JSON.parse(raw.toString("utf8"));
    const date = dir.split(/[\\/]/).pop()!;
    const manifest = {
      $schema: "../../../../../../schemas/manifest.schema.json",
      schemaVersion: 1,
      date,
      method,
      fetchedAt: now.toISOString(),
      sourceBuiltAt: data.builtAt ?? null,
      note,
      files,
      evidenceHtmlSha256: evSha,
    };
    writeFileSync(join(tmp, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
    loadSnapshot(tmp); // the exact check build-data runs; throws on any mismatch
    renameSync(tmp, dir);
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
  return dir;
}

/** Replace the "snapshot" and "snapshotSha256" values in election.json in place, keeping the rest of the file byte for byte. */
export function activate(electionFile: string, date: string, dataSha: string): void {
  let text = readFileSync(electionFile, "utf8");
  for (const [field, value] of [["snapshot", date], ["snapshotSha256", dataSha]]) {
    const re = new RegExp(`("${field}"\\s*:\\s*)"[^"]*"`, "g");
    const hits = text.match(re)?.length ?? 0;
    if (hits !== 1) fail(`${electionFile}: expected one "${field}" field, found ${hits}`);
    text = text.replace(re, `$1"${value}"`);
  }
  writeFileSync(electionFile, text);
}

export async function fetchSource(root: string, opts: FetchOptions): Promise<{ dir: string; date: string; method: string }> {
  const now = opts.now ?? new Date();
  const id = opts.election ?? readJson(join(root, "config/site.json")).currentElection;
  if (!id) fail("no --election given and config/site.json has no currentElection");
  const electionFile = join(root, "data/elections", id, "election.json");
  if (!existsSync(electionFile)) fail(`no election.json for ${id} at ${electionFile}`);
  const election = readJson(electionFile);
  const date = opts.date ?? localDate(now, election.timezone ?? "UTC");
  const dir = join(root, "data/elections", id, "sources/snapshots", date);
  if (existsSync(dir)) fail(`snapshot ${dir} already exists; refusing to overwrite it`);
  let raw: Buffer;
  const pages: Record<string, Buffer> = {};
  let method: string;
  let note: string;
  if (opts.from) {
    method = "manual-browser-export";
    const src = resolve(opts.from);
    const dataPath = join(src, "data.json");
    if (!existsSync(dataPath)) fail(`${src} has no data.json`);
    raw = readFileSync(dataPath);
    const got = sha256(raw);
    if (opts.sha256 && got !== opts.sha256) fail(`import refused: data.json SHA-256 is ${got}, expected ${opts.sha256}`);
    for (const pid of partyIds(raw, dataPath)) {
      const p = join(src, `${pid}-evidence.html`);
      if (!existsSync(p)) fail(`import refused: ${src} has no ${pid}-evidence.html`);
      pages[pid] = readFileSync(p);
    }
    note = opts.sha256
      ? `Imported from a manual browser export. data.json SHA-256 matched the hash given on the command line (${opts.sha256}).`
      : "Imported from a manual browser export. No expected data.json hash was given on the command line.";
  } else {
    method = "auto";
    const S = election.source;
    if (!S?.dataUrl || !S?.baseUrl || !S?.evidencePath) fail(`${id}: election.json source needs dataUrl, baseUrl and evidencePath`);
    raw = await download(S.dataUrl);
    for (const pid of partyIds(raw, S.dataUrl)) pages[pid] = await download(new URL(S.evidencePath.replace("{id}", pid), S.baseUrl).href);
    note = `Downloaded by scripts/fetch-source.ts from ${S.dataUrl} and ${S.baseUrl}${S.evidencePath}.`;
  }
  writeSnapshot(dir, raw, pages, method, now, note);
  if (opts.activate) activate(electionFile, date, sha256(raw));
  return { dir, date, method };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.env.LH_DATA_ROOT ? resolve(process.env.LH_DATA_ROOT) : REPO;
  try {
    const r = await fetchSource(root, parseArgs(process.argv.slice(2)));
    console.log(`wrote ${r.dir} (${r.method})`);
  } catch (e) {
    console.error("fetch-source failed:", (e as Error).message);
    process.exit(1);
  }
}
