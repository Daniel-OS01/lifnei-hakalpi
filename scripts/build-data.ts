// Builds public/data/elections/<id>/site.json for every election in config/site.json.
// Data root defaults to the repository; LH_DATA_ROOT points it at another tree (used by tests and the refusal gate).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import {
  assertNoDashes, buildCoalition, buildQuiz, claimIndex, fail, loadSnapshot, readDir, readJson,
} from "./lib/pipeline.ts";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseChangelog(md: string): { version: string; date: string; items: string[] }[] {
  const out: { version: string; date: string; items: string[] }[] = [];
  for (const line of md.split("\n")) {
    const h = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})\s*$/.exec(line);
    if (h) out.push({ version: h[1], date: h[2], items: [] });
    else if (/^- /.test(line) && out.length) out[out.length - 1].items.push(line.slice(2).trim());
  }
  return out;
}

const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** The site.json "content" object for one election (merge rule: docs/architecture.md). Tests reuse it. */
export function buildContent(root: string, id: string): Record<string, unknown> {
  const E = join(root, "data/elections", id);
  const content: Record<string, unknown> = {};
  for (const [name, p] of Object.entries(readDir(join(E, "content"), ".json"))) content[name] = readJson(p);
  for (const [name, p] of Object.entries(readDir(join(E, "content"), ".md"))) content[camel(name) + "Html"] = marked.parse(readFileSync(p, "utf8"));
  const method = join(root, "docs/method.md");
  if (existsSync(method)) content.methodHtml = marked.parse(readFileSync(method, "utf8"));
  for (const [name, p] of Object.entries(readDir(join(root, "data/common"), ".json"))) content[name] = readJson(p);
  const cl = join(root, "CHANGELOG.md");
  content.changelog = existsSync(cl) ? parseChangelog(readFileSync(cl, "utf8")) : [];
  return content;
}

export function buildElection(root: string, id: string, siteVersion: string, now = new Date()) {
  const E = join(root, "data/elections", id);
  const election = readJson(join(E, "election.json"));
  if (!election.snapshot) fail(`${id}: election.json has no active snapshot`);
  const snap = loadSnapshot(join(E, "sources/snapshots", election.snapshot));
  const ev = claimIndex(snap.data, snap.evidence);
  const content = buildContent(root, id);
  if (!content.questions) fail(`${id}: content/questions.json is required`);
  if (!content.lists) fail(`${id}: content/lists.json is required`);
  const coal: Record<string, unknown> = {};
  for (const [name, p] of Object.entries(readDir(join(E, "coalition"), ".json"))) coal[name] = readJson(p);
  for (const k of ["cells", "pm", "out", "lists", "surplus", "scenarios", "meta"]) if (!coal[k]) fail(`${id}: coalition/${k}.json is required`);
  const site = {
    schemaVersion: 2,
    build: { builtAt: now.toISOString(), siteVersion, snapshot: { date: election.snapshot, sha256: snap.dataSha, sourceBuiltAt: snap.data.builtAt } },
    election,
    quiz: buildQuiz(snap, content.questions, content.lists, election.source.baseUrl + "parties/", ev),
    coalition: buildCoalition(snap, coal, election, ev.index),
    content,
  };
  const text = JSON.stringify(site);
  assertNoDashes(text, `site.json for ${id}`);
  return { site, text, snap, ev };
}

export function buildAll(root: string, outRoot: string) {
  const cfg = readJson(join(root, "config/site.json"));
  const written: string[] = [];
  for (const id of cfg.elections as string[]) {
    const { text } = buildElection(root, id, cfg.siteVersion);
    const out = join(outRoot, "public/data/elections", id, "site.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
    written.push(out);
  }
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.env.LH_DATA_ROOT ? resolve(process.env.LH_DATA_ROOT) : REPO;
  try {
    for (const f of buildAll(root, root)) console.log("wrote", f);
  } catch (e) {
    console.error("build-data failed:", (e as Error).message);
    process.exit(1);
  }
}
