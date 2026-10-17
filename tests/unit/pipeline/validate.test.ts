import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { schemaFor, validateAgainst, validateAll } from "../../../scripts/validate-data.ts";
import { built, E, REPO } from "./helpers.ts";

const TMP = join(REPO, ".tmp");
const made: string[] = [];
const rel = "data/elections/2026-knesset-26";

/** Copy of config/ and the curated data (no raw snapshots or golden chunks) under the gitignored .tmp/. */
function copyTree(): string {
  mkdirSync(TMP, { recursive: true });
  const root = mkdtempSync(join(TMP, "validate-"));
  made.push(root);
  cpSync(join(REPO, "config"), join(root, "config"), { recursive: true });
  cpSync(join(REPO, "data"), join(root, "data"), {
    recursive: true,
    filter: (src) => !/[\\/]sources[\\/]golden/.test(src) && !/\.gz$/.test(src) && !/[\\/]data\.json$/.test(src),
  });
  return root;
}
const readJ = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const writeJ = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 1));
function mutate(root: string, file: string, fn: (j: any) => void) {
  const p = join(root, rel, file);
  const j = readJ(p);
  fn(j);
  writeJ(p, j);
}

afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

describe("validate-data", () => {
  it("the repository passes", () => {
    expect(validateAll(REPO)).toEqual([]);
  });

  it("the generated site.json for the repository election passes, and a broken one fails", () => {
    const site = JSON.parse(built().text);
    expect(validateAgainst("site", site)).toEqual([]);
    delete site.coalition.scen;
    expect(validateAgainst("site", site).join("\n")).toContain("scen");
  });

  it("a temp copy passes, so the failures below come from the mutation", () => {
    expect(validateAll(copyTree())).toEqual([]);
  });

  it("a C cell without cond fails", () => {
    const root = copyTree();
    mutate(root, "coalition/cells.json", (j) => {
      const c = j.cells.find((x: any) => x.lv === "C" && x.cond);
      delete c.cond;
    });
    const errs = validateAll(root);
    expect(errs.some((e) => e.startsWith(`${rel}/coalition/cells.json:`) && e.includes("cond"))).toBe(true);
  });

  it("a C cell with an empty cond fails", () => {
    const root = copyTree();
    mutate(root, "coalition/cells.json", (j) => {
      j.cells.find((x: any) => x.lv === "C").cond = "";
    });
    expect(validateAll(root).some((e) => e.includes("coalition/cells.json:"))).toBe(true);
  });

  it("an unknown extra data JSON fails", () => {
    const root = copyTree();
    writeJ(join(root, rel, "content/mystery.json"), { schemaVersion: 1 });
    writeJ(join(root, "data/stray.json"), {});
    const errs = validateAll(root);
    expect(errs.some((e) => e.startsWith(`${rel}/content/mystery.json:`) && e.includes("no schema"))).toBe(true);
    expect(errs.some((e) => e.startsWith("data/stray.json:"))).toBe(true);
  });

  it.each(["\u2013", "\u2014", "\u2015"])("dash U+%s written into a text field fails", (dash) => {
    const root = copyTree();
    mutate(root, "coalition/cells.json", (j) => {
      j.cells[0].t += ` x${dash}y`;
    });
    const errs = validateAll(root);
    expect(errs.some((e) => e.startsWith(`${rel}/coalition/cells.json:`) && e.includes("/cells/0/t"))).toBe(true);
  });

  it("a dash in a content text field fails", () => {
    const root = copyTree();
    mutate(root, "content/questions.json", (j) => {
      j.questions[0].stmt += "\u2013";
    });
    expect(validateAll(root).some((e) => e.includes("content/questions.json:") && e.includes("/questions/0/stmt"))).toBe(true);
  });

  it("the CLI honours LH_DATA_ROOT, prints file: error lines and exits 1", () => {
    const root = copyTree();
    mutate(root, "coalition/scenarios.json", (j) => {
      j.scen[0].why += "\u2014";
    });
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
    const run = (r: string) => spawnSync(join(REPO, "node_modules/.bin/tsx"), [join(REPO, "scripts/validate-data.ts")], { env: { ...env, LH_DATA_ROOT: r }, encoding: "utf8" });
    const bad = run(root);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain(`${rel}/coalition/scenarios.json: `);
    expect(run(copyTree()).status).toBe(0);
  });

  it("source files are exempt but every other data JSON maps to a schema name", () => {
    expect(schemaFor(`${rel}/sources/snapshots/2026-10-17/data.json`)).toBeUndefined();
    expect(schemaFor(`${rel}/sources/snapshots/2026-10-17/manifest.json`)).toBe("manifest");
    expect(schemaFor("data/common/glossary.json")).toBe("common-glossary");
    expect(schemaFor(`${rel}/other.json`)).toBeNull();
  });
});
