/* Quiz module: port of every v5 test.js assertion that concerns the quiz, a parity check against the v5
   page script (identical HTML for the same data and state), and render tests. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Ctx, SiteData, Cell } from "../../../src/types";
import { composeContent } from "../../helpers/compose-site";
import {
  quizModule, score, countValues, fresh, setState, getState, load, save, stateKey, summaryText, type QuizState, type Basis,
} from "../../../src/quiz";

const ID = "2026-knesset-26";
const site = JSON.parse(readFileSync("tests/fixtures/site-v5-artifact.json", "utf8")) as SiteData;
site.election = JSON.parse(readFileSync(`data/elections/${ID}/election.json`, "utf8"));
site.content = composeContent(ID) as SiteData["content"];
const ctx: Ctx = { site, now: Date.parse("2026-10-18T12:00:00+03:00"), electionIds: [ID], siteVersion: "5.0.0" };
const D = site.quiz;
const S = (st: Partial<QuizState>) => { const s = { ...fresh(), ...JSON.parse(JSON.stringify(st)) } as QuizState; setState(ID, s); return s; };
const V = quizModule.views;

let n = 0;
const ok = (c: unknown, m: string) => { if (!c) throw new Error("check failed: " + m); n++; };
const cell = (pid: string, qid: string) => D.cells[pid][D.questions.findIndex((q) => q.id === qid)];
const blank = () => ({ ans: {} as Record<string, number | null>, imp: {} as Record<string, number>, red: {} as Record<string, boolean> });

describe("v5 test.js port", () => {
  it("data integrity and spot values", () => {
    ok(D.parties.length === 15, "15 parties");
    ok(D.questions.length === 21, "21 questions");
    for (const p of D.parties) {
      ok(D.cells[p.id] && D.cells[p.id].length === 21, "21 cells for " + p.id);
      for (const c of D.cells[p.id]) {
        for (const k of ["s", "a"] as const) {
          const v = c[k];
          ok(v === null || (typeof v === "number" && v >= -2 && v <= 2 && Math.round(v * 2) === v * 2), `value range ${p.id} ${k}=${v}`);
          if (v === null) ok(["nf", "nc", "norec", "na", "abs"].includes(c[(k + "x") as "sx" | "ax"] as string), "missing value has a known reason " + p.id);
        }
        ok(typeof c.su === "string" && typeof c.au === "string", "evidence link present");
      }
    }
    ok(cell("likud", "override").s === 1 && cell("likud", "override").a === 2, "likud override +1/+2");
    ok(cell("likud", "sanctions").s === 1 && cell("likud", "sanctions").a === -2, "likud sanctions +1/-2");
    ok(cell("likud", "gaza_war").s === 2 && cell("likud", "gaza_war").a === -1, "likud gaza war +2/-1");
    ok(cell("likud", "arab_support").s === -2 && cell("likud", "arab_support").a === 2, "likud arab support -2/+2");
    ok(cell("beyahad", "sanctions").s === 2 && cell("beyahad", "sanctions").a === 2, "beyahad sanctions +2/+2");
    ok(cell("beyahad", "pal_state").s === -2, "beyahad pal state -2");
    ok(cell("beyahad", "raam_join").s === -2 && cell("beyahad", "raam_join").a === 2, "beyahad raam -2/+2");
    ok(D.short.every((id) => D.questions.some((q) => q.id === id)) && D.short.length === 10, "short set valid");
  });

  it("scoring properties", () => {
    for (const p of D.parties) {
      const st = blank();
      D.questions.forEach((q, i) => { const c = D.cells[p.id][i]; const v = c.s !== null && c.a !== null ? (c.s + c.a) / 2 : (c.s !== null ? c.s : c.a); if (v !== null) st.ans[q.id] = v; });
      const r = score(D, st, "both");
      const me = r.find((x) => x.p.id === p.id)!;
      ok(me.pct === 100, "self-match 100% for " + p.id + " got " + me.pct);
      ok(r[0].pct === 100, "a 100% party ranks first for " + p.id);
    }
    { const st = blank(); D.questions.forEach((q) => (st.ans[q.id] = 2)); score(D, st, "both").forEach((r) => ok(r.pct === null || (r.pct >= 0 && r.pct <= 100), "pct in range")); }
    { const st = blank(); st.ans.override = null; score(D, st, "both").forEach((r) => ok(r.answered === 0 && r.pct === null, "null answer excluded")); }
    {
      const st = blank(); st.ans.sanctions = 2; st.red.sanctions = true; st.ans.inquiry = 2;
      const r = score(D, st, "said");
      const utj = r.find((x) => x.p.id === "utj")!, utjVal = cell("utj", "sanctions").s;
      if (utjVal !== null && Math.abs(2 - utjVal) >= 2.5) {
        ok(utj.reds.length === 1, "utj crosses red line on sanctions");
        const firstRed = r.findIndex((x) => x.reds.length);
        ok(r.slice(firstRed).every((x) => x.reds.length || x.thin), "red-line parties sorted after the others");
      }
    }
    {
      const a = blank(); a.ans.sovereignty = 2; a.ans.women_rep = 2;
      const b = JSON.parse(JSON.stringify(a)); b.imp.sovereignty = 3;
      const pa = score(D, a, "said").find((x) => x.p.id === "likud")!.pct!, pb = score(D, b, "said").find((x) => x.p.id === "likud")!.pct!;
      ok(pb > pa, `weighting sovereignty raises likud (said): ${pa} -> ${pb}`);
    }
    {
      const st = blank(); st.ans.gaza_war = 2;
      const said = score(D, st, "said").find((x) => x.p.id === "likud")!, did = score(D, st, "did").find((x) => x.p.id === "likud")!;
      ok(said.pct === 100 && did.pct === Math.round((1 - 3 / 4) * 100), `likud gaza war said 100 / did 25: ${said.pct}/${did.pct}`);
    }
    { const st = blank(); ["civil_service", "gaza_settle", "lebanon"].forEach((id) => (st.ans[id] = 1)); score(D, st, "did").forEach((r) => ok(r.covered / Math.max(1, r.answered) >= 0.5 || r.pct === null, "thin coverage -> no pct")); }
  });

  it("data matches the verified source chunk; list metadata; no dashes in quiz output", () => {
    const raw = readFileSync(`data/elections/${ID}/sources/golden/2026-10-16-browser-chunks/out1.json`, "utf8").replace(/\n$/, "");
    ok(createHash("sha256").update(raw).digest("hex") === "be0f773da3b34c5927143c6cf814bbe805cd9d08e5a563bcabfb3145299a4dfc", "source chunk hash");
    const SRC = JSON.parse(raw);
    for (const p of D.parties) D.questions.forEach((q, i) => {
      const [s, a] = (SRC.V[p.id][i] as string).split("~").map((x) => x.split("|"));
      const val = (x: string[]) => (x[0] === "" ? null : Number(x[0]));
      const c = D.cells[p.id][i];
      ok(c.s === val(s) && c.a === val(a), `value ${p.id}/${q.id}`);
      if (c.s === null) ok(c.sx === (s[3] || "nf"), `reason s ${p.id}/${q.id}`);
      if (c.a === null) ok(c.ax === (a[3] || "nf"), `reason a ${p.id}/${q.id}`);
      ok(!!c.sl === (s[1] === "l" && c.s !== null) && !!c.al === (a[1] === "l" && c.a !== null), `confidence ${p.id}/${q.id}`);
    });
    let vals = 0;
    for (const p of D.parties) for (const c of D.cells[p.id]) for (const k of ["s", "a"] as const) if (c[k] !== null) vals++;
    ok(vals === 480 && countValues(D) === 480, "480 values, got " + vals);
    for (const p of D.parties) {
      ok(/^https:\/\/www\.idi\.org\.il\/media\//.test(p.cand), "candidate list link " + p.id);
      ok(p.pt && p.pt.length > 5, "platform status text " + p.id);
      ok(p.pl === null || /^https:\/\//.test(p.pl), "platform link format " + p.id);
      ok(p.pl || p.src, "missing platform has a source " + p.id);
      ok(p.top.length === 5 && p.conduct.total >= 0 && p.seats.n > 0, "list metadata " + p.id);
    }
    S({ mode: "long", done: true, ans: { override: 2, sanctions: -1 }, refl: { cost: { i: 3, note: "x" } } });
    ok(![V.home(ctx), V.results(ctx), summaryText(ctx)].some((h) => /[\u2013\u2014\u2015]/.test(h)), "no en/em dashes in quiz output");
  });

  it("reference scorer, written separately, agrees on 200 random answer sets x 3 bases", () => {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ref = (st: ReturnType<typeof blank>, basis: Basis, half = 0.5) => D.parties.map((p) => {
      let num = 0, den = 0, ans = 0, cov = 0;
      D.questions.forEach((q, i) => {
        const u = st.ans[q.id]; if (u === undefined || u === null) return; ans++;
        const c: Cell = D.cells[p.id][i];
        let v: number | null = null, low = false;
        if (basis === "said") { if (c.s !== null) { v = c.s; low = !!c.sl; } }
        else if (basis === "did") { if (c.a !== null) { v = c.a; low = !!c.al; } }
        else if (c.s !== null && c.a !== null) { v = (c.s + c.a) / 2; low = !!(c.sl && c.al); }
        else if (c.s !== null) { v = c.s; low = !!c.sl; } else if (c.a !== null) { v = c.a; low = !!c.al; }
        if (v === null) return; cov++;
        const w = (st.imp[q.id] || 1) * (low ? half : 1);
        num += w * (1 - Math.abs(u - v) / 4); den += w;
      });
      const thin = ans === 0 || cov / ans < 0.5;
      return [p.id, den && !thin ? Math.round(num / den * 100) : null] as const;
    });
    let sabotageCaught = 0;
    for (let t = 0; t < 200; t++) {
      const st = blank();
      D.questions.forEach((q) => { if (rnd() < 0.8) st.ans[q.id] = [-2, -1, 0, 1, 2][Math.floor(rnd() * 5)]; if (rnd() < 0.3) st.imp[q.id] = 1 + Math.floor(rnd() * 3); });
      for (const basis of ["both", "said", "did"] as Basis[]) {
        const got = Object.fromEntries(score(D, st, basis).map((r) => [r.p.id, r.pct]));
        for (const [pid, pct] of ref(st, basis)) ok(got[pid] === pct, `scorer ${basis} ${pid}: module ${got[pid]} vs reference ${pct}`);
        for (const [pid, pct] of ref(st, basis, 1)) if (got[pid] !== pct) sabotageCaught++;
      }
    }
    // the comparison is sensitive: a scorer without the low-confidence half weight disagrees somewhere
    expect(sabotageCaught).toBeGreaterThan(0);
  });

  it("check count: v5 had 11,059; the method-text and polling-link page checks belong to other views", () => {
    console.log("quiz port checks:", n);
    expect(n).toBe(11057);
  });
});

/* ---------- parity with the v5 page script ---------- */
function loadV5() {
  const html = readFileSync("tests/fixtures/artifact-v5.html", "utf8");
  const js = html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>")).trim().replace(/^\(function\(\)\{/, "").replace(/\}\)\(\);$/, "");
  const el = (): any => ({ innerHTML: "", textContent: "", style: {}, dataset: {}, hidden: false, setAttribute() {}, removeAttribute() {}, hasAttribute() { return true; }, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, focus() {}, appendChild() {}, remove() {} });
  let copied = "";
  const env = {
    window: { scrollTo() {}, scrollY: 0 },
    document: { getElementById: el, querySelector: el, querySelectorAll: () => [], createElement: el, body: el(), activeElement: null },
    localStorage: { getItem: () => null, setItem() {} }, location: { hash: "" }, history: { replaceState() {} },
    navigator: { clipboard: { writeText(t: string) { copied = t; return { then() {} }; } } },
  };
  const f = new Function(...Object.keys(env), js + "\nreturn {VIEWS: VIEWS, setS: function(x){ S = x; }, copy: copySummary};");
  const v5 = f(...Object.values(env));
  return { ...v5, copied: () => copied };
}

function randomStates(count: number): QuizState[] {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const out: QuizState[] = [];
  for (let t = 0; t < count; t++) {
    const mode = pick(["short", "long"] as const), s = fresh(mode);
    const qs = mode === "short" ? D.short : D.questions.map((q) => q.id);
    qs.forEach((id) => {
      if (rnd() < 0.75) s.ans[id] = mode === "short" ? pick([1.5, 0, -1.5, null]) : pick([-2, -1, 0, 1, 2, null]);
      if (rnd() < 0.3) s.imp[id] = 1 + Math.floor(rnd() * 3);
      if (rnd() < 0.15) s.red[id] = true;
    });
    if (mode === "short") s.top = D.short.filter((id) => s.ans[id] !== undefined && s.ans[id] !== null && rnd() < 0.2).slice(0, 2);
    else (site.content.reflect as { items: { id: string }[] }).items.forEach((r) => { if (rnd() < 0.5) s.refl[r.id] = { i: pick([0, 2, 3]), ...(rnd() < 0.5 ? { note: pick(["בדיקה", '<b>"x" & y</b>', ""]) } : {}) }; });
    s.done = rnd() < 0.5; s.basis = pick(["both", "said", "did"] as const);
    s.step = Math.floor(rnd() * (qs.length + (mode === "long" ? 2 : 1)));
    out.push(s);
  }
  return [fresh(), fresh("short"), fresh("long"), ...out];
}

describe("parity with v5", () => {
  it("home, quiz, results and the copy summary are identical to v5 for 400 states", () => {
    const v5 = loadV5();
    let compared = 0;
    for (const st of randomStates(400)) {
      v5.setS(JSON.parse(JSON.stringify(st))); S(st);
      for (const name of ["home", "quiz", "results"] as const) { expect(V[name](ctx), name + " " + JSON.stringify(st)).toBe(v5.VIEWS[name]()); compared++; }
      v5.copy(); expect(summaryText(ctx)).toBe(v5.copied()); compared++;
    }
    console.log("parity comparisons:", compared);
  });
});

/* ---------- render tests ---------- */
describe("render", () => {
  const fixed = () => S({ mode: "long", done: true, basis: "both", ans: Object.fromEntries(D.questions.map((q, i) => [q.id, [-2, -1, 0, 1, 2][i % 5]])), imp: { override: 3 }, red: { sanctions: true }, refl: { cost: { i: 3, note: "מחירים" }, env: { i: 2 } } });
  const clean = (h: string) => { expect(h).not.toMatch(/undefined|NaN/); return h; };

  it("home shows counts computed from the data", () => {
    S({});
    const h = clean(V.home(ctx));
    expect(h).toContain("<b>15</b> רשימות");
    expect(h).toContain("<b>21</b> היגדים");
    expect(h).toContain("<b>480</b> ערכי עמדה מתועדים");
    expect(h).toContain("<span>10 היגדים</span>");
    expect(h).toContain("8 נושאים לבדיקה עצמית");
    expect(h).toContain("מול 15 רשימות");
    expect(h).not.toMatch(/\{\{\w+\}\}/);
  });

  it("every quiz step renders in both tracks", () => {
    for (const mode of ["short", "long"] as const) {
      const total = (mode === "short" ? D.short.length : D.questions.length) + (mode === "long" ? 2 : 1);
      for (let step = 0; step < total; step++) {
        const s = S({ mode, step, ans: { override: 1, committee: null } });
        const h = clean(V.quiz(ctx));
        expect(h).toContain("שלב " + (step + 1) + " מתוך " + total);
        expect(s.step).toBe(step);
      }
    }
    S({ mode: "long", step: 0 });
    expect(V.quiz(ctx)).toContain('href="' + site.election.source.baseUrl + 'issues/judicial-reform.html"');
    S({ mode: "long", step: D.questions.findIndex((q) => q.id === "core") });
    expect(V.quiz(ctx)).toContain('href="' + site.election.source.baseUrl + 'questionnaire.html"');
  });

  it("results after a fixed answer set lists 15 parties, with the self-check and economy links", () => {
    fixed();
    const h = clean(V.results(ctx));
    expect(h.match(/<div class="party">/g)?.length).toBe(15);
    expect(h).toContain("מידע על ");
    expect(h).toContain('href="https://www.thepetek.com/he/issue/econ"');
    expect(h).toContain("לבדוק בעצמך במצעים");
    S({});
    expect(clean(V.results(ctx))).toContain("עדיין אין תוצאות");
    fixed();
    expect(clean(summaryText(ctx)).split("\n").length).toBe(7);
  });
});

/* ---------- state and handlers ---------- */
describe("state", () => {
  it("key, load and save are guarded and use the configured prefix", () => {
    expect(stateKey(ID)).toBe("lifnei-hakalpi-2026-knesset-26-quiz-v2");
    expect(load(ID)).toBeNull();   // no localStorage in node: guarded
    expect(() => save(ID)).not.toThrow();
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    try {
      S({ mode: "short", ans: { core: 1.5 } }); save(ID);
      expect(JSON.parse(store[stateKey(ID)])).toEqual({ ...fresh("short"), ans: { core: 1.5 } });
      expect(load(ID)).toEqual(getState(ID));
    } finally { delete (globalThis as any).localStorage; }
    expect(Object.keys(fresh())).toEqual(["mode", "step", "ans", "imp", "red", "top", "refl", "done", "basis"]);
  });

  it("bind handles quiz clicks and ignores events from other views", () => {
    const handlers: Record<string, (e: any) => void> = {};
    const root = { addEventListener: (t: string, f: (e: any) => void) => { handlers[t] = f; }, querySelector: () => null } as unknown as HTMLElement;
    const calls: string[] = []; let cur = "home";
    const api = { show: (v: string) => { calls.push("show:" + v); cur = v; }, rerender: () => calls.push("rerender"), announce: (t: string) => calls.push("announce:" + t), toast: () => {}, current: () => cur };
    quizModule.bind!(root, () => ctx, api);
    const click = (dataset: Record<string, string>, text = "") => handlers.click({ target: { closest: () => ({ dataset, textContent: text, setAttribute() {} }) } });
    S({ basis: "did" });
    click({ act: "start-long" });
    expect(getState(ID)).toMatchObject({ mode: "long", step: 0, basis: "did" });
    click({ ans: "2" }); click({ imp: "3" });
    expect(getState(ID).ans.override).toBe(2); expect(getState(ID).imp.override).toBe(3);
    handlers.change({ target: { dataset: { red: "1" }, checked: true } });
    expect(getState(ID).red.override).toBe(true);
    click({ act: "next" }); expect(getState(ID).step).toBe(1);
    click({ basis: "said" }, "מה שאמרו"); expect(getState(ID).basis).toBe("said");
    expect(calls).toEqual(["show:quiz", "rerender", "rerender", "show:quiz", "rerender", "announce:הדירוג עודכן: מה שאמרו"]);
    cur = "matrix"; click({ act: "start-short" });
    expect(getState(ID).mode).toBe("long");
  });
});
