/* Dry run of "open the next election" (docs/update-runbook.md): copy config/ and data/ to a temp root,
   add a dummy election folder, change only config/site.json, build with the real pipeline and render the
   real views. No file under src/ or scripts/ is touched; the test fails if any view still shows the
   current election's number, date or threshold where the new election's should be. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildAll } from "../../../scripts/build-data";
import { validateAll } from "../../../scripts/validate-data";
import { modules } from "../../../src/modules";
import { setState as setCoal, fresh as freshCoal } from "../../../src/coalition";
import type { Ctx, SiteData } from "../../../src/types";

const REPO = resolve(import.meta.dirname, "../../..");
const ROOT = join(REPO, ".tmp", "next-election-test");
const OLD = "2026-knesset-26", NEW = "2030-knesset-27";
const NOW = Date.parse("2030-10-20T12:00:00+03:00");
const views: Record<string, (c: Ctx) => string> = {};
modules.forEach((m) => Object.assign(views, m.views));
let site: SiteData;

beforeAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
  for (const d of ["config", "data", "docs"]) cpSync(join(REPO, d), join(ROOT, d), { recursive: true });
  cpSync(join(REPO, "CHANGELOG.md"), join(ROOT, "CHANGELOG.md"));
  cpSync(join(ROOT, "data/elections", OLD), join(ROOT, "data/elections", NEW), { recursive: true });
  const ep = join(ROOT, "data/elections", NEW, "election.json");
  const e = JSON.parse(readFileSync(ep, "utf8"));
  Object.assign(e, {
    id: NEW, knessetNumber: 27, nameHe: "הבחירות לכנסת ה-27", dayHe: "יום שלישי, 29.10.2030", dateIso: "2030-10-29",
    pollsOpen: "2030-10-29T07:00:00+02:00", pollsClose: "2030-10-29T22:00:00+02:00", thresholdPct: 3.5,
  });
  e.pollBan = { ...e.pollBan, from: "2030-10-26T00:00:00+03:00", until: "2030-10-29T22:00:00+02:00" };
  e.pollingInfo = { ...e.pollingInfo, registerClosed: "2030-09-05" };
  writeFileSync(ep, JSON.stringify(e, null, 2));
  const cp = join(ROOT, "config/site.json");
  const cfg = JSON.parse(readFileSync(cp, "utf8"));
  writeFileSync(cp, JSON.stringify({ ...cfg, currentElection: NEW, elections: [NEW, OLD] }, null, 2));
  buildAll(ROOT, ROOT);
  site = JSON.parse(readFileSync(join(ROOT, "public/data/elections", NEW, "site.json"), "utf8"));
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("next election dry run (data only, no code change)", () => {
  it("builds a site.json per election, and the new folder validates", () => {
    expect(existsSync(join(ROOT, "public/data/elections", OLD, "site.json"))).toBe(true);
    expect(site.election.id).toBe(NEW);
    expect(site.election.knessetNumber).toBe(27);
    expect(validateAll(ROOT)).toEqual([]);
  });

  it("every view renders the new election's values", () => {
    const ctx: Ctx = { site, now: NOW, electionIds: [NEW, OLD], siteVersion: "test" };
    setCoal(NEW, freshCoal(site.coalition, site.election, NOW));
    const all = Object.keys(views).map((v) => views[v](ctx)).join("\n");
    expect(all).toContain("29.10.2030");
    expect(all).toContain("3.5");
    expect(all).not.toContain("3.25");
    // the copied content files may still name the old date; the code-built views must not
    for (const v of ["home", "quiz", "results", "parties", "matrix", "coalition"]) expect(views[v](ctx), v).not.toContain("27.10.2026");
    const coal = views.coalition(ctx);
    expect(coal).toContain("ה-26");      // previous Knesset in the list cards, built from knessetNumber - 1
    expect(coal).not.toMatch(/בכנסת ה-25/);
  });
});
