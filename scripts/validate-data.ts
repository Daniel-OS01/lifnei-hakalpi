// Validates every data file against its JSON Schema (draft 2020-12) in schemas/.
// Usage: tsx scripts/validate-data.ts   (prints "file: error" lines, exit 1 on any error)
// The data root defaults to the repository; LH_DATA_ROOT points it at another tree holding config/ and data/
// (the same switch scripts/build-data.ts honours). Schemas always come from the repository.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMAS = join(REPO, "schemas");

let ajvCache: Ajv2020 | undefined;
function ajv(): Ajv2020 {
  if (ajvCache) return ajvCache;
  const a = new Ajv2020({ allErrors: true, strict: true });
  addFormats(a);
  for (const f of readdirSync(SCHEMAS).filter((n) => n.endsWith(".schema.json")).sort())
    a.addSchema(JSON.parse(readFileSync(join(SCHEMAS, f), "utf8")));
  return (ajvCache = a);
}

const hasSchema = (name: string) => existsSync(join(SCHEMAS, `${name}.schema.json`));
const schemaFile = (name: string) => `schemas/${name}.schema.json`;

/** Validate one parsed document against schemas/<name>.schema.json; returns error texts (empty when valid). */
export function validateAgainst(name: string, data: unknown): string[] {
  const a = ajv();
  const v = a.getSchema(`https://lifnei-hakalpi.local/schemas/${name}.schema.json`);
  if (!v) return [`no schema ${schemaFile(name)}`];
  if (v(data)) return [];
  return (v.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}${e.params && Object.keys(e.params).length ? ` ${JSON.stringify(e.params)}` : ""}`);
}

const posix = (p: string) => p.split(sep).join("/");
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (n.endsWith(".json")) out.push(p);
  }
  return out;
}

/** Which schema covers a data file (path relative to the data root, forward slashes)? null: none does. undefined: exempt. */
export function schemaFor(rel: string): string | null | undefined {
  let m: RegExpExecArray | null;
  if (rel === "config/site.json") return "site-config";
  if (/^data\/elections\/[^/]+\/election\.json$/.test(rel)) return "election";
  if ((m = /^data\/elections\/[^/]+\/content\/([^/]+)\.json$/.exec(rel))) return `content-${m[1]}`;
  if ((m = /^data\/elections\/[^/]+\/coalition\/([^/]+)\.json$/.exec(rel))) return `coalition-${m[1]}`;
  if ((m = /^data\/common\/([^/]+)\.json$/.exec(rel))) return `common-${m[1]}`;
  if (/^data\/elections\/[^/]+\/sources\/snapshots\/[^/]+\/manifest\.json$/.test(rel)) return "manifest";
  if (/^public\/data\/elections\/[^/]+\/site\.json$/.test(rel)) return "site";
  if (/^data\/elections\/[^/]+\/sources\//.test(rel)) return undefined; // raw and golden source files are not ours to describe
  return null;
}

/** Validate a data tree; returns "file: error" lines. */
export function validateAll(root: string): string[] {
  const errors: string[] = [];
  const files = [join(root, "config/site.json"), ...walk(join(root, "data")), ...walk(join(root, "public/data/elections"))];
  for (const f of files) {
    const rel = posix(relative(root, f));
    if (rel.startsWith("public/") && !rel.endsWith("/site.json")) continue;
    const name = schemaFor(rel);
    if (name === undefined) continue;
    if (!existsSync(f)) { errors.push(`${rel}: file is missing`); continue; }
    if (name === null) { errors.push(`${rel}: no schema covers this file (data JSON needs a matching schema in schemas/)`); continue; }
    if (!hasSchema(name)) { errors.push(`${rel}: no schema ${schemaFile(name)}`); continue; }
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(f, "utf8"));
    } catch (e) {
      errors.push(`${rel}: invalid JSON: ${(e as Error).message}`);
      continue;
    }
    for (const msg of validateAgainst(name, data)) errors.push(`${rel}: ${msg}`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.env.LH_DATA_ROOT ? resolve(process.env.LH_DATA_ROOT) : REPO;
  const errors = validateAll(root);
  for (const e of errors) console.error(e);
  console.log(errors.length ? `validate-data: ${errors.length} error(s)` : "validate-data: ok");
  process.exit(errors.length ? 1 : 0);
}
