import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { findDashes } from "../../../scripts/check-dashes";

const EM = "\u2014";
const EN = "\u2013";
const BAR = "\u2015";
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dashes-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("findDashes", () => {
  it("reports file and line for each forbidden dash", () => {
    writeFileSync(join(dir, "bad.md"), `line one\nא ${EM} ב\nok ${EN} no ${BAR}\n`);
    const hits = findDashes([dir]);
    expect(hits.map((h) => [h.line, h.codePoint])).toEqual([
      [2, "U+2014"],
      [3, "U+2013"],
    ]);
    expect(hits[0]!.file.endsWith("bad.md")).toBe(true);
  });

  it("passes a clean tree with hyphens", () => {
    writeFileSync(join(dir, "ok.md"), "a - b, c-d\n");
    expect(findDashes([dir])).toEqual([]);
  });

  it("skips node_modules, .gz and binary files, and missing paths", () => {
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", "x.js"), EM);
    writeFileSync(join(dir, "a.js.gz"), EM);
    writeFileSync(join(dir, "blob.dat"), Buffer.from([0, 1, 2, 0xe2, 0x80, 0x94]));
    expect(findDashes([dir, join(dir, "missing")])).toEqual([]);
  });

  it("exits 1 on an offending file and 0 on a clean one (CLI)", () => {
    const run = (p: string) =>
      spawnSync("npx", ["tsx", "scripts/check-dashes.ts", p], { encoding: "utf8" }).status;
    writeFileSync(join(dir, "bad.txt"), `x ${EM} y\n`);
    expect(run(dir)).toBe(1);
    rmSync(join(dir, "bad.txt"));
    writeFileSync(join(dir, "good.txt"), "x - y\n");
    expect(run(dir)).toBe(0);
  });
});
