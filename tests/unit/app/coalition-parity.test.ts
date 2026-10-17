/* Coalition parity: the v5 coal.js page script, run through new Function with stubs, renders
   VIEWS.coalition byte-identical to coalitionModule.views.coalition for the same data, state and clock. */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Ctx } from "../../../src/types";
import { v5Site } from "../../helpers/compose-site";
import { coalitionModule, fresh, setState, type CoalState } from "../../../src/coalition";

const site = v5Site();
const K = site.coalition, E = site.election;
const PRE = Date.parse("2026-10-18T12:00:00+03:00"), BAN = Date.parse("2026-10-25T12:00:00+03:00");
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

beforeAll(() => { vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} }); });
afterAll(() => { vi.unstubAllGlobals(); });

/* v5's esc, taken verbatim from the v5 artifact */
const v5esc = new Function("return " + /function esc\(s\)\{[^\n]*?\}\); \}/.exec(readFileSync("tests/fixtures/artifact-v5.html", "utf8"))![0])();
const v5src = readFileSync("/home/claude/src/coal.js", "utf8").replace("__COAL__", "__K");

function v5At(now: number) {
  const VIEWS: Record<string, () => string> = {};
  const win: { __NOW: number; __coal?: { set(s: CoalState): void } } = { __NOW: now };
  new Function("__K", "esc", "VIEWS", "window", "view", "localStorage", "current", "rerender", "announce", "toast", v5src)(
    clone(K), v5esc, VIEWS, win, { addEventListener() {} }, { getItem: () => null, setItem: () => {} }, "coalition", () => {}, () => {}, () => {});
  return (s: CoalState) => { win.__coal!.set(clone(s)); return VIEWS.coalition(); };
}
function ours(now: number, s: CoalState) {
  const ctx: Ctx = { site, now, electionIds: [E.id], siteVersion: "test" };
  setState(E.id, clone(s));
  return coalitionModule.views.coalition(ctx);
}
function states(now: number): [string, CoalState][] {
  const f = fresh(K, E, now), out: [string, CoalState][] = [["fresh", f]];
  K.scen.forEach((sc, i) => {
    const s = clone(f);
    K.lists.forEach((l) => { s.st[l.id] = sc.lists.includes(l.id) ? "in" : "out"; }); s.pm = sc.pm || null;
    out.push(["scenario " + (i + 1), s]);
  });
  const sel = clone(f); sel.sel = K.lists[K.lists.length - 1].id; sel.st[K.lists[1].id] = "in";
  out.push(["selected list " + sel.sel, sel]);
  return out;
}

describe("coalition view parity with v5 coal.js", () => {
  it("v5 source and fixtures are the ones this test expects", () => {
    expect(v5src).toContain("VIEWS.coalition = function(){");
    expect(K.scen.length).toBe(3);
    expect(K.lists[K.lists.length - 1].id).not.toBe(fresh(K, E, PRE).sel);
  });
  for (const [label, now] of [["PRE", PRE], ["BAN", BAN]] as const) {
    for (const [name, s] of states(now)) {
      it(`${label}: ${name} renders byte-identical`, () => {
        const v5 = v5At(now)(s), mine = ours(now, s);
        expect(mine.length).toBeGreaterThan(1000);
        expect(mine).toBe(v5);
      });
    }
  }
});
