// Writes a .gz copy next to every compressible file so nginx can serve it with gzip_static.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { gzipSync, constants } from "node:zlib";
import { fileURLToPath } from "node:url";

const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt", ".xml", ".map"]);
const MIN_BYTES = 256;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

export function precompress(dir: string): { files: number; savedBytes: number } {
  let files = 0;
  let savedBytes = 0;
  if (!existsSync(dir)) throw new Error(`precompress: ${dir} does not exist`);
  for (const file of walk(dir)) {
    if (!COMPRESSIBLE.has(extname(file).toLowerCase())) continue;
    const raw = readFileSync(file);
    if (raw.length < MIN_BYTES) continue;
    const gz = gzipSync(raw, { level: constants.Z_BEST_COMPRESSION });
    if (gz.length >= raw.length) continue;
    writeFileSync(file + ".gz", gz);
    files++;
    savedBytes += raw.length - gz.length;
  }
  return { files, savedBytes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? "dist";
  const r = precompress(dir);
  console.log(`precompress: ${r.files} files, ${r.savedBytes} bytes saved in ${dir}`);
}
