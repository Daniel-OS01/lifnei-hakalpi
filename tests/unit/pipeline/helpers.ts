import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildElection } from "../../../scripts/build-data.ts";

export const REPO = resolve(import.meta.dirname, "../../..");
export const E = join(REPO, "data/elections/2026-knesset-26");
export const G17 = join(E, "sources/golden/2026-10-17-browser-chunks");
export const G16 = join(E, "sources/golden/2026-10-16-browser-chunks");
export const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
let cache: ReturnType<typeof buildElection> | undefined;
export const built = () => (cache ??= buildElection(REPO, "2026-knesset-26", "test", new Date("2026-10-17T00:00:00Z")));
/** Structural diff: list of paths where a and b differ. */
export function diff(a: unknown, b: unknown, path = "", out: string[] = []): string[] {
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) diff((a as never)[k], (b as never)[k], `${path}/${k}`, out);
  } else if (a !== b) out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  return out;
}
