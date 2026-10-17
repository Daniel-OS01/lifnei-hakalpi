// Field-level parity report: the v5 artifact's data (tests/fixtures/quiz-v5.json, coal-v5.json) against what
// the pipeline builds now. Markdown goes to stdout, and also to the file given by --out <path>.
// Output is deterministic: v5 order first, then anything only the new build has, in its order. The only date
// printed is the snapshot date; the build time is never read.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildElection } from "./build-data.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ELECTION = "2026-knesset-26";

type Kind = "changed" | "added" | "removed";
interface Row { path: string; v5: unknown; now: unknown; kind: Kind; record: string }
interface Section { title: string; rows: Row[] }

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
/** Arrays without records inside (cp, below, conduct parts) are compared as one value. */
const isLeaf = (x: unknown): boolean => !x || typeof x !== "object" || (Array.isArray(x) && !x.some(isObj));

/** Keys of a then keys only b has, in their own order. */
function unionKeys(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): string[] {
  const ka = Object.keys(a ?? {});
  return [...ka, ...Object.keys(b ?? {}).filter((k) => !ka.includes(k))];
}

function walk(a: unknown, b: unknown, path: string, record: string, out: Row[]): void {
  if (a === undefined && b === undefined) return;
  if (a === undefined || b === undefined || isLeaf(a) || isLeaf(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, v5: a, now: b, kind: a === undefined ? "added" : b === undefined ? "removed" : "changed", record });
    return;
  }
  const A = a as Record<string, unknown>, B = b as Record<string, unknown>;
  for (const k of unionKeys(A, B)) walk(A[k], B[k], `${path}/${k}`, record, out);
}

/** Turn a list of records into an ordered map by a key, so rows name the record instead of its index. */
function keyed(list: Any[] | undefined, key: (x: Any) => string): Record<string, Any> {
  const m: Record<string, Any> = {};
  for (const x of list ?? []) {
    const k = key(x);
    if (k in m) throw new Error(`duplicate key ${k}`);
    m[k] = x;
  }
  return m;
}

/** Compare two maps of records; each record is diffed field by field. */
function records(title: string, prefix: string, a: Record<string, Any>, b: Record<string, Any>): Section {
  const rows: Row[] = [];
  for (const k of unionKeys(a, b)) walk(a[k], b[k], `${prefix}/${k}`, k, rows);
  return { title, rows };
}

/** quiz.cells keyed party -> question id (each side uses its own question order). */
function quizCells(q: Any): Record<string, Any> {
  const ids: string[] = q.questions.map((x: Any) => x.id);
  const m: Record<string, Any> = {};
  for (const [pid, cells] of Object.entries(q.cells as Record<string, Any[]>)) {
    cells.forEach((c, i) => { m[`${pid}/${ids[i]}`] = c; });
  }
  return m;
}

/** The top-level fields no other section covers, diffed field by field. */
function rest(title: string, prefix: string, a: Any, b: Any, done: string[]): Section {
  // Lists of records with an id (quiz questions) are keyed by that id, so a row names the record.
  const byId = (v: Any) => (Array.isArray(v) && v.length && v.every((x) => isObj(x) && typeof x.id === "string") ? keyed(v, (x) => x.id) : v);
  const omit = (o: Any) => Object.fromEntries(Object.entries(o).filter(([k]) => !done.includes(k)).map(([k, v]) => [k, byId(v)]));
  const rows: Row[] = [];
  walk(omit(a), omit(b), prefix, prefix, rows);
  for (const r of rows) r.record = r.path.split("/")[1];
  return { title, rows };
}

export function compare(q5: Any, c5: Any, quiz: Any, coal: Any): Section[] {
  const QUIZ_DONE = ["cells", "parties"];
  const COAL_DONE = ["lists", "cells", "pm", "out", "surplus", "scen"];
  const pair = (x: Any) => `${x.a}+${x.b}`;
  return [
    records("Quiz cells (party / question / field)", "cells", quizCells(q5), quizCells(quiz)),
    records("Quiz party meta", "parties", keyed(q5.parties, (p) => p.id), keyed(quiz.parties, (p) => p.id)),
    rest("Quiz, other fields", "quiz", q5, quiz, QUIZ_DONE),
    records("Coalition lists", "lists", keyed(c5.lists, (p) => p.id), keyed(coal.lists, (p) => p.id)),
    records("Coalition cells", "cells", keyed(c5.cells, (x) => `${x.a}>${x.b}`), keyed(coal.cells, (x) => `${x.a}>${x.b}`)),
    records("Coalition pm", "pm", keyed(c5.pm, (x) => `${x.a}>${x.h}`), keyed(coal.pm, (x) => `${x.a}>${x.h}`)),
    records("Coalition out", "out", c5.out, coal.out),
    records("Coalition surplus", "surplus", keyed(c5.surplus, pair), keyed(coal.surplus, pair)),
    records("Coalition scen", "scen", keyed(c5.scen, (s) => s.id), keyed(coal.scen, (s) => s.id)),
    rest("Coalition, other fields", "coalition", c5, coal, COAL_DONE),
  ];
}

function fmt(v: unknown): string {
  if (v === undefined) return "(absent)";
  // Records are printed in full when short; a long one (quiz cats) is named by its size only.
  let s = JSON.stringify(v);
  if (!isLeaf(v) && s.length > 120) s = Array.isArray(v) ? `(list of ${v.length} records)` : `(record with ${Object.keys(v as object).length} fields)`;
  return "`" + s.replace(/`/g, "'").replace(/\|/g, "\\|") + "`";
}

const count = (rows: Row[], k: Kind) => rows.filter((r) => r.kind === k).length;

export function render(sections: Section[], meta: { snapshot: string; sha: string; quizAsof: string; coalAsof: string }): string {
  const L: string[] = [];
  L.push(`# Data parity report, snapshot ${meta.snapshot}`, "");
  L.push(`Compares the v5 artifact's data (\`tests/fixtures/quiz-v5.json\`, as of ${meta.quizAsof}; \`tests/fixtures/coal-v5.json\`, as of ${meta.coalAsof}) with what \`scripts/build-data.ts\` builds now from snapshot ${meta.snapshot} (data.json SHA-256 \`${meta.sha}\`).`, "");
  L.push("Generated by `npx tsx scripts/parity-report.ts`. Kinds: changed (both sides have the field), added (only the new build has it), removed (only v5 has it). Lists without records inside are compared as one value.", "");
  for (const s of sections) {
    L.push(`## ${s.title}`, "");
    if (!s.rows.length) { L.push("No differences.", ""); continue; }
    L.push("| Path | v5 value | New value | Kind |", "|---|---|---|---|");
    for (const r of s.rows) L.push(`| \`${r.path}\` | ${fmt(r.v5)} | ${fmt(r.now)} | ${r.kind} |`);
    L.push("");
  }
  L.push("## Summary", "", "| Section | Records affected | Changed | Added | Removed |", "|---|---|---|---|---|");
  for (const s of sections) {
    L.push(`| ${s.title} | ${new Set(s.rows.map((r) => r.record)).size} | ${count(s.rows, "changed")} | ${count(s.rows, "added")} | ${count(s.rows, "removed")} |`);
  }
  const all = sections.flatMap((s) => s.rows);
  const quizCells = sections[0].rows;
  const coal = sections.filter((s) => s.title.startsWith("Coalition")).flatMap((s) => s.rows);
  L.push("");
  L.push(`Summary: ${all.length} differing fields (${count(all, "changed")} changed, ${count(all, "added")} added, ${count(all, "removed")} removed). ` +
    `Quiz cells: ${quizCells.length} fields in ${new Set(quizCells.map((r) => r.record)).size} cells. ` +
    `Coalition: ${coal.length} fields (${count(coal, "changed")} changed, ${count(coal, "added")} added, ${count(coal, "removed")} removed).`);
  return L.join("\n") + "\n";
}

function main(): void {
  const args = process.argv.slice(2);
  const i = args.indexOf("--out");
  const outPath = i >= 0 ? args[i + 1] : undefined;
  if (i >= 0 && !outPath) throw new Error("--out needs a path");
  const json = (p: string) => JSON.parse(readFileSync(join(REPO, p), "utf8"));
  const q5 = json("tests/fixtures/quiz-v5.json");
  const c5 = json("tests/fixtures/coal-v5.json");
  // v5 named lists[].prevFaction k25; rename it in place so the field compares, and keeps its row position.
  c5.lists = c5.lists.map((l: Any) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k === "k25" ? "prevFaction" : k, v])));
  const { site } = buildElection(REPO, ELECTION, "report");
  const md = render(compare(q5, c5, site.quiz, site.coalition), {
    snapshot: site.build.snapshot.date, sha: site.build.snapshot.sha256, quizAsof: q5.asof, coalAsof: c5.asof,
  });
  process.stdout.write(md);
  if (outPath) {
    mkdirSync(dirname(resolve(outPath)), { recursive: true });
    writeFileSync(outPath, md);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
