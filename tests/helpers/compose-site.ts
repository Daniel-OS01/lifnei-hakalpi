/* Dev and test helper until scripts/build-data.ts is merged: composes public/data/elections/<id>/site.json
   from the v5 fixture plus the content files, with the same merge rule as the pipeline
   (docs/architecture.md). Usage: npx tsx tests/helpers/compose-site.ts */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { marked } from "marked";

const ROOT = process.cwd();
const camel = (s: string) => s.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());

export function composeContent(electionId: string): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  const add = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (f.endsWith(".json")) content[camel(basename(f, ".json"))] = JSON.parse(readFileSync(p, "utf8"));
      else if (f.endsWith(".md")) content[camel(basename(f, ".md")) + "Html"] = marked.parse(readFileSync(p, "utf8"), { async: false });
    }
  };
  add(join(ROOT, "data/common"));
  add(join(ROOT, "data/elections", electionId, "content"));
  const method = join(ROOT, "docs/method.md");
  if (existsSync(method)) content.methodHtml = marked.parse(readFileSync(method, "utf8"), { async: false });
  content.changelog = parseChangelog(join(ROOT, "CHANGELOG.md"));
  return content;
}

export function parseChangelog(path: string) {
  if (!existsSync(path)) return [];
  const out: { version: string; date: string; items: string[] }[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const h = /^## \[([^\]]+)\] - (\d{4}-\d\d-\d\d)/.exec(line);
    if (h) { out.push({ version: h[1], date: h[2], items: [] }); continue; }
    const it = /^- (.+)$/.exec(line);
    if (it && out.length) out[out.length - 1].items.push(it[1].trim());
  }
  return out;
}

function main() {
  const id = "2026-knesset-26";
  const site = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/site-v5-artifact.json"), "utf8"));
  site.election = JSON.parse(readFileSync(join(ROOT, "data/elections", id, "election.json"), "utf8"));
  site.content = composeContent(id);
  const q = site.content.questions as { categories?: Record<string, unknown> } | undefined;
  if (!site.quiz.cats && q?.categories) site.quiz.cats = q.categories;
  const out = join(ROOT, "public/data/elections", id);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "site.json"), JSON.stringify(site));
  console.log("composed", join(out, "site.json"));
}
if (process.argv[1] && process.argv[1].endsWith("compose-site.ts")) main();
