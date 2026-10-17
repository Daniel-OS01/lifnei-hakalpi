// Fails when U+2013, U+2014 or U+2015 appears in a text file.
// The characters are written as escapes so this file passes its own check.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const DASH = /[\u2013\u2014\u2015]/;
const SKIP_DIRS = new Set(["node_modules", ".git", ".tmp", "test-results", "playwright-report"]);
const SKIP_EXT = new Set([
  ".gz", ".br", ".zip", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".pdf", ".mp4", ".webm", ".mp3",
]);
export const DEFAULT_PATHS = ["src", "data", "docs", "dist", "config", "CHANGELOG.md", "README.md"];

export interface DashHit {
  file: string;
  line: number;
  col: number;
  codePoint: string;
}

function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0);
}

function* walk(path: string): Generator<string> {
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const name of readdirSync(path).sort()) {
      if (SKIP_DIRS.has(name)) continue;
      yield* walk(join(path, name));
    }
  } else if (st.isFile() && !SKIP_EXT.has(extname(path).toLowerCase())) {
    yield path;
  }
}

export function findDashes(paths: string[]): DashHit[] {
  const hits: DashHit[] = [];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    for (const file of walk(p)) {
      const buf = readFileSync(file);
      if (isBinary(buf)) continue;
      buf.toString("utf8").split("\n").forEach((text, i) => {
        const m = DASH.exec(text);
        if (m) {
          hits.push({
            file,
            line: i + 1,
            col: m.index + 1,
            codePoint: "U+" + m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0"),
          });
        }
      });
    }
  }
  return hits;
}

function main(): void {
  const args = process.argv.slice(2);
  const hits = findDashes(args.length ? args : DEFAULT_PATHS);
  for (const h of hits) console.log(`${h.file}:${h.line}:${h.col} ${h.codePoint}`);
  if (hits.length) {
    console.error(`check-dashes: ${hits.length} forbidden dash character(s) found`);
    process.exit(1);
  }
  console.log("check-dashes: ok");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
