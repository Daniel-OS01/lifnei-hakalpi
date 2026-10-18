/* Coalition module: port of every v5 test_coal.js check (data integrity, sums, the threshold rule,
   rescale, conflicts, PM statements, outside support, save and load, back to polls, the ban window,
   golden hashes, rendering and copy text), plus bind() driven through a fake root. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Api, Ctx, Src } from "../../../src/types";
import { v5Site } from "../../helpers/compose-site";
import { inBan } from "../../../src/time";
import { shellModule } from "../../../src/views/shell";
import {
  coalitionModule, fresh, sanitize, sums, setSeat, step, rescale, back, clear, cellOf, conflicts, text, validSeat,
  getState, setState, save, stateKey, load, stateOf, type CoalState, type Conflicts, type Refusal,
} from "../../../src/coalition";

const site = v5Site();
const K = site.coalition, E = site.election;
const IDS = K.lists.map((p) => p.id);
const PRE = Date.parse("2026-10-18T12:00:00+03:00"), BAN = Date.parse("2026-10-25T12:00:00+03:00"), AFTER = Date.parse("2026-10-28T12:00:00+02:00");
const ctxAt = (now: number): Ctx => ({ site, now, electionIds: [E.id], siteVersion: "test" });
const GOLD = `data/elections/${E.id}/sources/golden/2026-10-17-browser-chunks/`;

let n = 0;
const ok = (c: unknown, m: string) => { if (!c) throw new Error("check failed: " + m); n++; };
function rnd(seed: number) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }

/* Map-backed localStorage stub; a throwing one proves every storage access sits in try/catch. */
const store = new Map<string, string>();
const memStorage = { getItem: (k: string) => (store.has(k) ? store.get(k)! : null), setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); } };
const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
beforeEach(() => { store.clear(); vi.stubGlobal("localStorage", memStorage); setState(E.id, fresh(K, E, PRE)); });
afterEach(() => { vi.unstubAllGlobals(); });

const set = (ins: string[], sups: string[] = [], pm: string | null = null) => {
  const s = fresh(K, E, PRE); ins.forEach((i) => { s.st[i] = "in"; }); sups.forEach((i) => { s.st[i] = "sup"; }); s.pm = pm; return s;
};

describe("v5 test_coal.js port", () => {
  it("1. golden chunks match the hashes computed in the source browser", () => {
    const H: Record<string, string> = { "meta.json": "2fc53b52c1fa19dc02b6568c8b5e698d3314b1f5a2f3a403eafe50c5b48a451b", "coal.txt": "ee0cb1ac81e4ffdb68c87858d41e6171db33189ccb155df1b0c39a01c9ae565f", "claims.json": "ebda84bf116617091c82e3c37a676e6673d9bb0a81705926c2b4dd33e395879a" };
    for (const f in H) {
      let b = readFileSync(GOLD + f); while (b[b.length - 1] === 10) b = b.subarray(0, -1);
      ok(createHash("sha256").update(b).digest("hex") === H[f], "sha256 " + f);
    }
  });

  it("2. data integrity: sources, dates, unique pairs, values equal the copied chunks", () => {
    const CL = JSON.parse(readFileSync(GOLD + "claims.json", "utf8")) as Record<string, unknown>;
    const linkOk = (s: Src[] | undefined) => !!s && s.length > 0 && s.every((x) => (x.u && /^https?:\/\//.test(x.u)) || (x.e && /^https:\/\/elections2026\.underwar\.co\.il\//.test(x.e)));
    for (const c of K.cells) {
      ok("XCNOP".includes(c.lv), "level valid " + c.a + ">" + c.b);
      ok(linkOk(c.s), "cell has a source link " + c.a + ">" + c.b);
      ok(/^\d{4}-\d\d-\d\d$/.test(c.d), "cell has a date " + c.a + ">" + c.b);
      if (c.lv === "C") ok(c.cond && c.cond.length > 3, "conditional cell states its condition " + c.a + ">" + c.b);
      for (const x of c.s) if (x.e && x.e.includes("#claim-")) ok(x.e.split("#claim-")[1] in CL, "claim copied " + x.e);
      for (const st of c.st || []) ok(linkOk(st.s) && st.d, "earlier stage has source and date");
    }
    for (const c of K.pm) ok(linkOk(c.s) && "XCNOP".includes(c.lv), "pm statement has a source " + c.a);
    for (const k in K.out) ok(linkOk(K.out[k].s), "outside-support statement has a source " + k);
    for (const p of K.lists) {
      ok(linkOk(p.gov.s), "governments line sourced " + p.id);
      if (p.cond) ok(linkOk(p.cond.s), "condition sourced " + p.id);
      p.nu.forEach((x) => ok(linkOk(x.s), "nuance sourced " + p.id));
    }
    const seen = new Set<string>();
    for (const c of K.cells) { ok(c.a !== c.b && !seen.has(c.a + ">" + c.b), "unique pair"); seen.add(c.a + ">" + c.b); }
    const DB: Record<string, number | null> = {};
    readFileSync(GOLD + "coal.txt", "utf8").trim().split("\n").forEach((l) => { const f = l.split("|"); DB[f[0] + "|" + f[1] + "|" + f[2]] = f[3] === "" ? null : +f[3]; });
    for (const c of K.cells.concat(K.pm)) if (c.db) ok(DB[c.a + "|" + c.db.q + "|s"] === c.db.v, "db value matches source " + c.a + " " + c.db.q);
    for (const k in K.out) ok(DB[k + "|OUT|s"] === K.out[k].v, "outside-support value matches source " + k);
    for (const p of K.lists) for (const q of ["BB", "RAAM", "OUT", "HAR"]) {
      ok(K.cq[p.id][q].s === DB[p.id + "|" + q + "|s"] && K.cq[p.id][q].a === DB[p.id + "|" + q + "|a"], "coalition question values " + p.id + q);
    }
    for (const p of K.lists) for (const q of p.gaps) ok(Math.abs((K.cq[p.id][q].s as number) - (K.cq[p.id][q].a as number)) >= 2, "gap is real " + p.id + q);
  });

  it("3. sums", () => {
    const R = rnd(42);
    for (let t = 0; t < 300; t++) {
      const s = fresh(K, E, PRE); let coal = 0, sup = 0, tot = 0;
      IDS.forEach((id) => {
        const v = R() < 0.3 ? 0 : 4 + Math.floor(R() * 30); s.seats[id] = v;
        const st = (["in", "out", "sup"] as const)[Math.floor(R() * 3)]; s.st[id] = st;
        tot += v; if (st === "in") coal += v; if (st === "sup") sup += v;
      });
      const m = sums(K, s); ok(m.coal === coal && m.sup === sup && m.total === tot, "sums " + t);
    }
    const s = fresh(K, E, PRE);
    ok(sums(K, s).total === 120 && sums(K, s).coal === 0, "fresh pre-ban start sums to 120 with an empty coalition");
  });

  it("4. threshold rule: never 1 to 3; steps; rescale only keeps the rule", () => {
    const R = rnd(43);
    const s = fresh(K, E, PRE);
    ([1, 2, 3, "1", "3", " 2 "] as const).forEach((v) => { const r = setSeat(E, s, "likud", v); ok(!r.ok && /לפחות 4/.test(r.msg), "reject " + v + " and explain the threshold"); });
    ([-1, 121, 2.5, "abc", "", "4.5"] as const).forEach((v) => ok(!setSeat(E, s, "likud", v).ok, "reject invalid " + v));
    ([0, 4, 5, 61, 120, "0", "4", "120"] as const).forEach((v) => ok(setSeat(E, s, "likud", v).ok && s.seats.likud === +v, "accept " + v));
    [1, 2, 3].forEach((v) => ok(!validSeat(E, v), "validSeat refuses " + v));
    s.seats.raam = 4; step(E, s, "raam", -1); ok(s.seats.raam === 0, "4 minus one is 0");
    step(E, s, "raam", 1); ok(s.seats.raam === 4, "0 plus one is 4");
    s.seats.raam = 120; step(E, s, "raam", 1); ok(s.seats.raam === 120, "max 120");
    for (let t = 0; t < 2000; t++) { const id = IDS[Math.floor(R() * IDS.length)]; step(E, s, id, R() < 0.5 ? -1 : 1); }
    ok(IDS.every((id) => !(s.seats[id] >= 1 && s.seats[id] <= 3)), "random steps never produce 1 to 3");
    for (let t = 0; t < 400; t++) {
      const r = fresh(K, E, PRE); IDS.forEach((id) => { r.seats[id] = R() < 0.4 ? 0 : 4 + Math.floor(R() * (R() < 0.2 ? 60 : 15)); });
      if (sums(K, r).total === 0) continue;
      const before = { ...r.seats }; rescale(K, E, r);
      ok(sums(K, r).total === 120, "rescale sums to 120 (" + t + ")");
      ok(IDS.every((id) => r.seats[id] === 0 || r.seats[id] >= 4), "rescale keeps the threshold rule (" + t + ")");
      ok(IDS.every((id) => (before[id] === 0) === (r.seats[id] === 0)), "rescale keeps who has seats (" + t + ")");
    }
  });

  it("5. conflicts match an independent reading of the matrix", () => {
    const R = rnd(44);
    function ref(s: CoalState) {
      const inn = IDS.filter((id) => s.st[id] === "in"), hard: string[] = [], cond: string[] = [];
      for (const a of inn) for (const b of inn) {
        if (a === b) continue; const c = K.cells.find((x) => x.a === a && x.b === b);
        if (c && c.lv === "X") hard.push("pair:" + a + ">" + b); if (c && c.lv === "C") cond.push("pair:" + a + ">" + b);
      }
      const pm = s.pm && s.st[s.pm] === "in" ? s.pm : null;
      if (pm) for (const a of inn) for (const p of K.pm) if (p.a === a && p.h === pm && a !== pm) { if (p.lv === "X") hard.push("pm:" + a + ">" + pm); if (p.lv === "C") cond.push("pm:" + a + ">" + pm); }
      for (const b of IDS.filter((id) => s.st[id] === "sup")) if (K.arab.includes(b)) for (const a of inn) if (K.out[a] && K.out[a].lv === "X") hard.push("out:" + a + ">" + b);
      return { hard: hard.sort(), cond: cond.sort() };
    }
    const key = (x: Refusal) => x.k + ":" + x.a + ">" + x.b;
    for (let t = 0; t < 600; t++) {
      const s = fresh(K, E, PRE); IDS.forEach((id) => { s.st[id] = (["in", "out", "sup", "in"] as const)[Math.floor(R() * 4)]; });
      const inn = IDS.filter((id) => s.st[id] === "in"); s.pm = R() < 0.6 && inn.length ? inn[Math.floor(R() * inn.length)] : null;
      const got = conflicts(K, s), want = ref(s);
      ok(JSON.stringify(got.hard.map(key).sort()) === JSON.stringify(want.hard), "explicit conflicts match the matrix (" + t + ")");
      ok(JSON.stringify(got.cond.map(key).sort()) === JSON.stringify(want.cond), "conditional conflicts match the matrix (" + t + ")");
    }
  });

  it("5a. asymmetric pairs", () => {
    ok(cellOf(K, "hademokratim", "likud")!.lv === "X" && cellOf(K, "likud", "hademokratim")!.lv === "O", "fixture: asymmetric pair");
    const r = conflicts(K, set(["hademokratim", "likud"]));
    ok(r.hard.some((x) => x.k === "pair" && x.a === "hademokratim" && x.b === "likud"), "asymmetric: Democrats on Likud is a conflict");
    ok(!r.hard.concat(r.cond).some((x) => x.a === "likud" && x.b === "hademokratim"), "asymmetric: Likud on the Democrats is not");
    ok(!cellOf(K, "shas", "yisrael-beiteinu"), "fixture: Shas on YB is unknown");
    const r2 = conflicts(K, set(["yisrael-beiteinu", "shas"]));
    ok(r2.hard.length === 1 && r2.unknown.some((x) => x[0] === "shas" && x[1] === "yisrael-beiteinu"), "asymmetric: one conflict and one unknown");
  });

  it("5b. a conditional refusal keeps its condition and stays separate", () => {
    ok(cellOf(K, "kachol-lavan", "shas")!.lv === "C", "fixture: conditional");
    const r = conflicts(K, set(["kachol-lavan", "shas"]));
    ok(r.cond.length === 1 && r.hard.length === 0 && /חוק גיוס/.test((r.cond[0].c as { cond: string }).cond), "conditional refusal listed as conditional with its condition");
  });

  it("5c. outside support is checked against the outside-support question only", () => {
    const r = conflicts(K, set(["beyahad"], ["raam"]));
    ok(r.hard.some((x) => x.k === "out" && x.a === "beyahad"), "Beyahad vs Ra'am outside support: explicit (OUT question)");
    ok(cellOf(K, "beyahad", "raam")!.lv === "X" && r.hard.filter((x) => x.a === "beyahad").length === 1, "the seating refusal is not counted for an outside supporter");
    ok(!r.hard.some((x) => x.k === "pair"), "outside supporter is not checked against seating cells");
    const r2 = conflicts(K, set(["hademokratim"], ["hadash-taal"]));
    ok(r2.hard.length === 0 && r2.cond.length === 0, "Democrats with Joint List outside: no conflict (they accept outside support)");
    const r3 = conflicts(K, set(["hademokratim", "hadash-taal"]));
    ok(r3.cond.some((x) => x.a === "hademokratim" && x.b === "hadash-taal"), "Joint List inside the coalition: Democrats' conditional refusal applies");
    const r4 = conflicts(K, set(["yashar"], ["raam"]));
    ok(r4.hard.length === 0 && r4.info.some((x) => x.k === "outn"), "Yashar has no explicit statement on outside support: info only");
    const r5 = conflicts(K, set(["likud"], ["shas"]));
    ok(r5.info.some((x) => x.k === "supnote"), "non-Arab outside supporter: noted as not checked");
  });

  it("5d. PM statements depend on who heads the government", () => {
    const a = conflicts(K, set(["yashar", "likud"]));
    ok(a.pmMaybe.some((x) => x.a === "yashar" && x.b === "likud") && !a.hard.some((x) => x.k === "pm"), "PM not chosen: Yashar on Netanyahu is shown as depending on the PM");
    const b = conflicts(K, set(["yashar", "likud"], [], "likud"));
    ok(b.hard.some((x) => x.k === "pm" && x.a === "yashar"), "Netanyahu as PM: Yashar's refusal is a conflict");
    const c = conflicts(K, set(["yashar", "likud"], [], "yashar"));
    ok(!c.hard.some((x) => x.k === "pm" && x.a === "yashar") && c.pmMaybe.length === 0, "Eisenkot as PM: no Netanyahu conflict");
    const d = conflicts(K, set(["yashar", "amcha-israel"], [], "yashar"));
    ok(d.hard.some((x) => x.k === "pm" && x.a === "amcha-israel" && x.b === "yashar"), "Am Yisrael on Eisenkot as PM");
    const e = conflicts(K, set(["miluimnikim", "likud"], [], "likud"));
    ok(e.cond.some((x) => x.k === "pm" && x.a === "miluimnikim"), "Miluimnikim on Netanyahu: conditional");
    const f: Conflicts = conflicts(K, set(["yashar"], [], "likud"));
    ok(f.pm === null && f.hard.length === 0, "a PM whose list is outside the coalition is ignored");
  });

  it("6. save and load", () => {
    const KEY = stateKey(E.id);
    const s = fresh(K, E, PRE); s.seats.likud = 30; s.seats.raam = 0; s.st.likud = "in"; s.st.raam = "sup"; s.pm = "likud"; s.polls = false; s.sel = "shas";
    setState(E.id, s); save(E.id);
    const l = load(K, E, PRE);
    ok(l.seats.likud === 30 && l.seats.raam === 0 && l.st.likud === "in" && l.st.raam === "sup" && l.pm === "likud" && l.sel === "shas", "save then load restores the state");
    store.set(KEY, "{not json"); ok(JSON.stringify(load(K, E, PRE).seats) === JSON.stringify(fresh(K, E, PRE).seats), "corrupt storage falls back to fresh");
    store.set(KEY, JSON.stringify({ seats: { likud: 2, shas: "x", yashar: 500, raam: 3, beyahad: 1 }, st: { likud: "maybe" }, pm: "nobody" }));
    const z = load(K, E, PRE);
    ok(z.seats.likud === K.start.likud && z.seats.yashar === K.start.yashar && z.st.likud === "out" && z.pm === null, "invalid stored values are dropped");
    ok(z.seats.raam === K.start.raam && z.seats.beyahad === K.start.beyahad && z.seats.shas === K.start.shas, "stored seats of 1 to 3 are dropped");
    const p = fresh(K, E, PRE); p.st.likud = "in"; store.set(KEY, JSON.stringify(p));
    const b = load(K, E, BAN); ok(IDS.every((id) => b.seats[id] === 0) && b.st.likud === "in", "during the ban stored poll numbers are not loaded");
    const u = fresh(K, E, PRE); u.polls = false; u.seats.likud = 33; store.set(KEY, JSON.stringify(u));
    ok(load(K, E, BAN).seats.likud === 33, "seats the user typed are kept during the ban");
    ok(sanitize(K, E, null, PRE).seats.likud === K.start.likud, "sanitize of nothing is fresh");
    vi.stubGlobal("localStorage", throwing);
    ok(load(K, E, PRE).seats.likud === K.start.likud, "storage errors fall back to fresh");
    expect(() => save(E.id)).not.toThrow();
  });

  it("6b. stored seats with polls:true are replaced by the current medians", () => {
    const old = fresh(K, E, PRE); IDS.forEach((id) => { old.seats[id] = K.start[id] === 10 ? 11 : 10; }); old.st.likud = "in";
    expect(IDS.every((id) => old.seats[id] !== K.start[id])).toBe(true);
    const a = sanitize(K, E, JSON.parse(JSON.stringify(old)), PRE);
    expect(IDS.every((id) => a.seats[id] === K.start[id]) && a.polls && a.st.likud === "in").toBe(true);
    const typed = sanitize(K, E, JSON.parse(JSON.stringify({ ...old, polls: false })), PRE);
    expect(IDS.every((id) => typed.seats[id] === old.seats[id]) && !typed.polls).toBe(true);
    const b = sanitize(K, E, JSON.parse(JSON.stringify(old)), BAN);
    expect(IDS.every((id) => b.seats[id] === 0) && !b.polls).toBe(true);
  });

  it("6a. state is cached per election and read through stateOf(ctx)", () => {
    const s = fresh(K, E, PRE); s.sel = "shas"; setState(E.id, s);
    ok(getState(K, E, PRE) === s && stateOf(ctxAt(PRE)) === s, "setState is what getState and stateOf return");
    ok(getState(K, { ...E, id: "other-election" }, PRE) !== s, "another election id has its own state");
  });

  it("7. back to polls, clear, the ban window", () => {
    const s = fresh(K, E, PRE); setSeat(E, s, "likud", 50); clear(K, s);
    ok(IDS.every((id) => s.seats[id] === 0 && s.st[id] === "out") && s.pm === null, "clear empties everything");
    ok(back(K, E, s, PRE) && IDS.every((id) => s.seats[id] === K.start[id]) && s.polls, "back to polls restores the medians");
    ok(IDS.every((id) => K.start[id] === Math.floor(K.lists.find((p) => p.id === id)!.med)), "start = median rounded down");
    const t = fresh(K, E, PRE); setSeat(E, t, "likud", 50);
    ok(!back(K, E, t, BAN) && t.seats.likud === 50, "back to polls is refused during the ban");
    ok(IDS.every((id) => fresh(K, E, BAN).seats[id] === 0) && !fresh(K, E, BAN).polls, "fresh state during the ban has no poll numbers");
    ok(inBan(Date.parse("2026-10-24T00:00:00+03:00"), E) && !inBan(Date.parse("2026-10-23T23:59:00+03:00"), E) && !inBan(Date.parse("2026-10-27T22:00:00+02:00"), E) && inBan(Date.parse("2026-10-27T21:59:00+02:00"), E), "ban window edges");
    ok(!inBan(AFTER, E), "after the polls close");
  });

  it("8. rendering and copy text", () => {
    const V = coalitionModule.views.coalition;
    setState(E.id, fresh(K, E, PRE));
    const h = V(ctxAt(PRE));
    ok(!/undefined|NaN|\[object/.test(h), "render has no undefined");
    ok((h.match(/class="krow /g) || []).length === 15, "15 rows");
    ok((h.match(/<label class="sr" for="ks-/g) || []).length === 15, "every seat field has a label");
    ok(/חציון 20 \(טווח 18 עד 29\)/.test(h), "medians shown before the ban");
    setState(E.id, fresh(K, E, BAN));
    const hb = V(ctxAt(BAN));
    ok(!/undefined|NaN|\[object/.test(hb), "ban render has no undefined");
    ok(!/חציון \d/.test(hb) && /תקופת איסור פרסום סקרים/.test(hb), "no poll numbers during the ban, notice shown");
    ok(/data-kact="back" disabled/.test(hb), "back-to-polls disabled during the ban");
    ok(/אינם עדכניים, ואין ללמוד מהם/.test(shellModule.views.parties(ctxAt(BAN))), "parties tab shows the notice the law requires during the ban");
    const s = set(["hademokratim", "likud"]); s.seats = { ...K.start };
    const txt = text(K, E, s);
    ok(/לא תחזית/.test(txt) && /הדמוקרטים על הליכוד: פוסלת במפורש/.test(txt) && /29/.test(txt), "copy text has the disclaimer, seats sum and the conflict");
    ok(!/[\u2013\u2014\u2015]/.test(h + hb + txt), "no long or medium dashes in the coalition view or the copy text");
  });

  /* v5 test_coal.js prints 3429 on the same data; this port adds 8 (validSeat 1 to 3, stored 1 to 3,
     sanitize of nothing, the ban render, the per-election cache). */
  it("ran every check", () => { expect(n).toBe(3429 + 8); });
});

/* bind(): a fake root that collects the handlers; events carry fake targets with dataset and closest(). */
describe("bind", () => {
  type H = (e: { target: unknown; key?: string }) => void;
  function setup(now = PRE) {
    const handlers: Record<string, H> = {}, errs: Record<string, { textContent: string }> = {};
    const root = {
      addEventListener: (t: string, f: H) => { handlers[t] = f; },
      querySelector: (sel: string) => (sel.startsWith("#ke-") ? (errs[sel] ||= { textContent: "" }) : null),
      appendChild: vi.fn(),
    };
    const api = { show: vi.fn(), rerender: vi.fn(), announce: vi.fn(), toast: vi.fn(), current: vi.fn(() => "coalition") } satisfies Api;
    const ctx = ctxAt(now);
    coalitionModule.bind!(root as unknown as HTMLElement, () => ctx, api);
    const btn = (dataset: Record<string, string>) => { const b = { dataset }; return { closest: () => b }; };
    const input = (dataset: Record<string, string>, value: string) => ({ dataset, value, attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; } });
    return { handlers, errs, api, click: (d: Record<string, string>) => handlers.click({ target: btn(d) }), change: (t: ReturnType<typeof input>) => handlers.change({ target: t }), input };
  }
  const S = () => stateOf(ctxAt(PRE));

  it("seat input: 3 is rejected with the threshold message, 5 is accepted and saved", () => {
    const b = setup(), before = S().seats.likud;
    const bad = b.input({ kseat: "likud", kid: "likud" }, "3"); b.change(bad);
    expect(S().seats.likud).toBe(before);
    expect(b.errs["#ke-likud"].textContent).toMatch(/לפחות 4/);
    expect(bad.value).toBe(String(before)); expect(bad.attrs["aria-invalid"]).toBe("true");
    expect(b.api.rerender).not.toHaveBeenCalled();
    b.change(b.input({ kseat: "likud", kid: "likud" }, "5"));
    expect(S().seats.likud).toBe(5); expect(S().polls).toBe(false);
    expect(b.api.rerender).toHaveBeenCalledTimes(1);
    expect(b.api.announce).toHaveBeenCalledWith(expect.stringMatching(/^בקואליציה 0 מתוך 61\. סך הכול \d+ מתוך 120\.$/));
    expect(JSON.parse(store.get(stateKey(E.id))!).seats.likud).toBe(5);
  });

  it("step click moves by the threshold rule and announces", () => {
    const b = setup(); S().seats.raam = 4;
    b.click({ kstep: "-1", kid: "raam" });
    expect(S().seats.raam).toBe(0); expect(b.api.rerender).toHaveBeenCalled();
    expect(b.api.announce).toHaveBeenCalledWith(expect.stringMatching(/: 0 מנדטים\. בקואליציה/));
  });

  it("rescale click brings the total to 120; back-to-polls restores medians; clear empties", () => {
    const b = setup(); S().seats.likud = 60;
    b.click({ kact: "rescale" });
    expect(sums(K, S()).total).toBe(120); expect(b.api.announce).toHaveBeenLastCalledWith(expect.stringMatching(/^המנדטים הותאמו ל-120\./));
    b.click({ kact: "back" });
    expect(IDS.every((id) => S().seats[id] === K.start[id])).toBe(true); expect(S().polls).toBe(true);
    S().st.likud = "in";
    b.click({ kact: "clear" });
    expect(IDS.every((id) => S().seats[id] === 0 && S().st[id] === "out")).toBe(true);
    expect(b.api.announce).toHaveBeenLastCalledWith("התרחיש נוקה.");
  });

  it("back-to-polls click does nothing during the ban", () => {
    setState(E.id, fresh(K, E, BAN)); const b = setup(BAN); S().seats.likud = 30;
    b.click({ kact: "back" });
    expect(S().seats.likud).toBe(30); expect(b.api.rerender).not.toHaveBeenCalled();
  });

  it("scenario apply sets statuses and PM from the data", () => {
    const b = setup(), sc = K.scen[0];
    b.click({ kscen: sc.id });
    IDS.forEach((id) => expect(S().st[id]).toBe(sc.lists.includes(id) ? "in" : "out"));
    expect(S().pm).toBe(sc.pm || null);
    expect(b.api.announce).toHaveBeenCalledWith(expect.stringContaining("נטען התרחיש: " + sc.t));
  });

  it("status change (the counter) announces the live line and the conflict count", () => {
    const b = setup(); S().st.likud = "in";
    b.change(b.input({ kst: "in", kid: "hademokratim" }, "on"));
    expect(S().st.hademokratim).toBe("in");
    expect(b.api.announce).toHaveBeenCalledWith(expect.stringMatching(/בקואליציה\. בקואליציה \d+ מתוך 61\..*התנגשויות בצירוף: [1-9]/));
  });

  it("events are ignored while another tab is current", () => {
    const b = setup(); b.api.current.mockReturnValue("parties"); S().seats.likud = 30;
    b.click({ kact: "clear" });
    expect(S().seats.likud).toBe(30); expect(b.api.announce).not.toHaveBeenCalled();
  });

  it("copy writes the scenario text and confirms with api.toast", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const b = setup(); b.click({ kact: "copy" });
    await Promise.resolve(); await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(text(K, E, S()));
    expect(b.api.toast).toHaveBeenCalledWith("התרחיש הועתק");
  });

  it("copy falls back to a selected textarea and says so with api.toast", () => {
    const ta = { value: "", rows: 0, setAttribute: vi.fn(), focus: vi.fn(), select: vi.fn() };
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { createElement: () => ta });
    const b = setup(); b.click({ kact: "copy" });
    expect(ta.value).toBe(text(K, E, S())); expect(ta.select).toHaveBeenCalled();
    expect(b.api.toast).toHaveBeenCalledWith(expect.stringMatching(/אפשר להעתיק אותו ידנית/));
  });
});
