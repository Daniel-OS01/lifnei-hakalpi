import { describe, it, expect } from "vitest";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { shellModule } from "../../../src/views/shell";
import { methodCounts, missingCounts } from "../../../src/views/method-slots";
import { scan, partyIds } from "../../../scripts/check-election-agnostic";
import type { Ctx, SiteData } from "../../../src/types";
import { v5Site } from "../../helpers/compose-site";

const site: SiteData = v5Site();
const NOW = Date.parse("2026-10-18T12:00:00+03:00");
const BAN_NOW = Date.parse("2026-10-25T12:00:00+03:00");
const ctxAt = (now: number): Ctx => ({ site, now, electionIds: [site.election.id], siteVersion: site.build.siteVersion });
const NAMES = ["matrix", "parties", "tools", "decide", "method"] as const;
const render = (name: string, now = NOW) => shellModule.views[name](ctxAt(now));
const DASHES = /[\u2013\u2014\u2015]/;

/* Runs the v5 inline script with minimal stubs and returns its VIEWS table (each takes no arguments). */
function v5Views(now: number): Record<string, () => string> {
  const html = readFileSync("tests/fixtures/artifact-v5.html", "utf8");
  const start = html.indexOf("<script>") + "<script>".length, end = html.lastIndexOf("</script>");
  const src = html.slice(start, end).replace(/\nvar start = /, "\nwindow.__VIEWS = VIEWS;\nvar start = ");
  expect(src).toContain("window.__VIEWS = VIEWS;");
  const el = (): any => new Proxy(function () {}, {
    get: (_t, k) => (k === "dataset" ? {} : k === "classList" ? { add() {}, remove() {} } : k === "querySelectorAll" ? () => [] : k === "innerHTML" || k === "textContent" ? "" : el()),
    set: () => true,
    apply: () => el(),
  });
  const win: any = { __NOW: now, scrollTo() {}, scrollY: 0 };
  const doc: any = { getElementById: el, querySelector: el, querySelectorAll: () => [], createElement: el, body: el(), activeElement: null };
  const store = { getItem: () => null, setItem() {} };
  new Function("document", "localStorage", "window", "location", "history", "navigator", "setTimeout", src)(
    doc, store, win, { hash: "" }, { replaceState() {} }, {}, () => 0);
  return win.__VIEWS;
}

/* Known v5 vs new differences, normalized before comparing:
   1. method: marked writes " as &quot; and ' as &#39; in text; v5 has them raw (the ' case is the same marked
      escaping, found while writing this test; flagged for review).
   2. method: the section "איך הנתונים הועתקו ונבדקו" sits after "קרבה" in the new output (moved).
   3. footer version: v5 "5.0.0" vs new "5".
   4. tools: URL escaping differs (&amp; in hrefs).
   5. method: the changelog list comes from the repo CHANGELOG.md (semver headings, a repo entry for 5.0.0),
      not from v5's inline list, so the list body is compared separately below. */
function normalize(name: string, h: string): string {
  let out = h.replace(/5\.0\.0/g, "5");
  if (name === "tools") out = out.replace(/&amp;/g, "&");
  if (name === "method") {
    out = out.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const T = "איך הנתונים הועתקו ונבדקו", K = "קרבה";
    const sections = (s: string) => s.split(/(?=<h3>)/);
    const parts = sections(out);
    const ti = parts.findIndex((p) => p.includes(T)), ki = parts.findIndex((p) => p.includes(K));
    if (ti >= 0 && ki >= 0 && ti !== ki + 1) { const [t] = parts.splice(ti, 1); parts.splice(parts.findIndex((p) => p.includes(K)) + 1, 0, t); }
    out = parts.join("").replace(/(<h3>יומן גרסאות<\/h3><ul class="check small">)[\s\S]*?(<\/ul><\/section>)$/, "$1$2");
  }
  return out;
}

describe("app shell views", () => {
  it.each(NAMES)("%s renders without throwing and has no long dashes", (name) => {
    const h = render(name);
    expect(h.length).toBeGreaterThan(200);
    expect(h).not.toMatch(DASHES);
  });

  it.each(NAMES)("%s matches the v5 output (known differences normalized)", (name) => {
    const v5 = v5Views(NOW)[name]();
    expect(normalize(name, render(name))).toBe(normalize(name, v5));
  });

  it("method changelog renders every CHANGELOG.md entry, newest first", () => {
    const h = render("method"), log = site.content.changelog;
    expect(log.length).toBeGreaterThan(0);
    const got = [...h.matchAll(/<li><b>גרסה ([^ ]+) \(/g)].map((m) => m[1]);
    expect(got).toEqual(log.map((e) => e.version));
  });

  it("parties view matches v5 inside the ban window too", () => {
    expect(normalize("parties", render("parties", BAN_NOW))).toBe(normalize("parties", v5Views(BAN_NOW).parties()));
  });

  it("parties view: ban notice inside the ban window, polls outside it", () => {
    const banned = render("parties", BAN_NOW), open = render("parties", NOW);
    expect(banned).toContain("תקופת איסור פרסום סקרים");
    expect(banned).toContain("פורסם לפני תקופת איסור הפרסום");
    /* v5 keeps the pre-ban poll figures on the cards during the ban, labelled as stale; the notice is the guard. */
    expect(open).not.toContain("תקופת איסור פרסום סקרים");
    expect(open).not.toContain("פורסם לפני תקופת איסור הפרסום");
    expect(open).toMatch(/חציון \d+ מנדטים/);
  });

  it("election-agnostic check", () => {
    const ids = partyIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(scan("src", ids)).toEqual([]);
    mkdirSync(".tmp/agnostic-probe", { recursive: true });
    try {
      writeFileSync(".tmp/agnostic-probe/x.ts", "// 2026-10-27\n");
      expect(scan(".tmp/agnostic-probe", ids).length).toBeGreaterThan(0);
    } finally { rmSync(".tmp/agnostic-probe", { recursive: true, force: true }); }
  });

  it("election-agnostic check: scripts/lib names no list id, date or Knesset-numbered source field", () => {
    expect(scan("scripts/lib", partyIds())).toEqual([]);
    mkdirSync(".tmp/agnostic-probe-fields", { recursive: true });
    try {
      writeFileSync(".tmp/agnostic-probe-fields/x.ts", "const k = p.knesset25_faction_he; // 2026-10-27\n");
      const hits = scan(".tmp/agnostic-probe-fields", [], true);
      expect(hits).toHaveLength(1);
      expect(hits[0]).toContain("Knesset-numbered field name");
      expect(scan(".tmp/agnostic-probe-fields", [])).toHaveLength(2);
    } finally { rmSync(".tmp/agnostic-probe-fields", { recursive: true, force: true }); }
  });

  it("methodCounts total is parties x questions x 2", () => {
    const total = site.quiz.parties.length * site.quiz.questions.length * 2;
    const m = missingCounts(site);
    expect(m.values + m.missing).toBe(total);
    expect(methodCounts(site)).toContain("מתוך " + total + " הערכים");
  });
});
