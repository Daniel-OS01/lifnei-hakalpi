// Source checks: every value the site shows traces back to the verified snapshot or to a dated, sourced curated entry.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildElection } from "../../../scripts/build-data.ts";
import { assessments, COAL_Q, coalDb, conductCounts, encodeCell } from "../../../scripts/lib/pipeline.ts";
import { validateAgainst } from "../../../scripts/validate-data.ts";
import { built, E, G16, json, REPO } from "./helpers.ts";

const ID = "2026-knesset-26";
const SNAP = `data/elections/${ID}/sources/snapshots/2026-10-17`;
const TMP = join(REPO, ".tmp");
const made: string[] = [];

/** Copy of config/ and data/ (no golden chunks) under the gitignored .tmp/. */
function copyTree(): string {
  mkdirSync(TMP, { recursive: true });
  const root = mkdtempSync(join(TMP, "checks-"));
  made.push(root);
  cpSync(join(REPO, "config"), join(root, "config"), { recursive: true });
  cpSync(join(REPO, "data"), join(root, "data"), { recursive: true, filter: (src) => !/[\\/]sources[\\/]golden/.test(src) });
  return root;
}
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
const cli = (root: string) =>
  spawnSync(join(REPO, "node_modules/.bin/tsx"), [join(REPO, "scripts/build-data.ts")], { env: { ...env, LH_DATA_ROOT: root }, encoding: "utf8" });
const build = (root: string) => () => buildElection(root, ID, "test", new Date("2026-10-17T00:00:00Z"));

afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

const qs: { id: string; sourceQuestionId: string }[] = json(join(E, "content/questions.json")).questions;
const coal = (f: string) => json(join(E, "coalition", `${f}.json`));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DMY = /^\d{1,2}\.\d{1,2}\.\d{4}$/;
const sum = (o: Record<string, number>) => Object.values(o).reduce((x, y) => x + y, 0);

describe("hash refusal", () => {
  it("an unmodified temp copy builds, so the refusals below come from the mutation", () => {
    expect(build(copyTree())().site.quiz.parties).toHaveLength(15);
  });

  it("one flipped byte in data.json is refused with a SHA-256 message (throw and CLI exit 1)", () => {
    const root = copyTree();
    const p = join(root, SNAP, "data.json");
    const buf = readFileSync(p);
    const i = buf.indexOf('"builtAt":"') + '"builtAt":"'.length;
    buf[i] = buf[i] === 0x39 ? 0x38 : buf[i] + 1; // one digit changes, the JSON stays valid
    writeFileSync(p, buf);
    expect(build(root)).toThrow(/^snapshot refused: SHA-256 mismatch for data\.json \(manifest [0-9a-f]{64}, file [0-9a-f]{64}\)$/);
    const r = cli(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("build-data failed: snapshot refused: SHA-256 mismatch for data.json");
  });

  it("a missing evidence .gz is refused against the manifest (throw and CLI exit 1)", () => {
    const root = copyTree();
    rmSync(join(root, SNAP, "evidence-html/amcha-israel-evidence.html.gz"));
    const msg = "snapshot refused: evidence-html/amcha-israel-evidence.html.gz is listed in the manifest but missing";
    expect(build(root)).toThrow(msg);
    const r = cli(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`build-data failed: ${msg}`);
  });
});

describe("curated coalition statements", () => {
  const claims = built().ev.index;
  const srcOk = (s: unknown) =>
    typeof s === "string"
      ? s === "issues/coalition-lines.html" || s in claims
      : !!s && typeof s === "object" && !!(s as { u?: string }).u && !!(s as { o?: string }).o && ISO.test((s as { d?: string }).d ?? "");
  type Raw = { lv: string; d?: string; cond?: string | null; src?: unknown[]; st?: Raw[] };
  const problems = (x: Raw, w: string, dated: boolean): string[] => {
    const out: string[] = [];
    if (dated && !ISO.test(x.d ?? "")) out.push(`${w}: no ISO date`);
    if (!["X", "C", "N", "O", "P"].includes(x.lv)) out.push(`${w}: level ${x.lv}`);
    if (!x.src?.length) out.push(`${w}: no source`);
    for (const s of x.src ?? []) if (!srcOk(s)) out.push(`${w}: unresolvable source ${JSON.stringify(s)}`);
    if (x.lv === "C" && !(typeof x.cond === "string" && x.cond.trim())) out.push(`${w}: C without cond`);
    (x.st ?? []).forEach((s, i) => out.push(...problems(s, `${w} stage ${i}`, true)));
    return out;
  };

  it("every cell, pm and out statement and every st stage has a date, a level in X C N O P, a resolvable source, and C has a cond", () => {
    const cells: (Raw & { a: string; b: string })[] = coal("cells").cells;
    const pm: (Raw & { a: string; h: string })[] = coal("pm").pm;
    const out: Record<string, Raw> = coal("out").out;
    const errs = [
      ...cells.flatMap((x) => problems(x, `cell ${x.a}->${x.b}`, true)),
      ...pm.flatMap((x) => problems(x, `pm ${x.a}->${x.h}`, true)),
      // out entries carry no date field (coalition/out.json and CoalData.out have none); every other check applies
      ...Object.entries(out).flatMap(([pid, x]) => problems(x, `out ${pid}`, false)),
    ];
    expect(errs).toEqual([]);
    const stages = [...cells, ...pm].reduce((n, x) => n + (x.st?.length ?? 0), 0);
    expect([cells.length, pm.length, Object.keys(out).length, stages]).toEqual([87, 15, 13, 15]);
  });
});

describe("quiz matrix", () => {
  it("every non-unknown cell side links to a claim on an evidence page and has a date (its as-of, else the claim's; 28 rest on undated source claims)", () => {
    const { site, ev } = built();
    const errs: string[] = [];
    let n = 0;
    let undated = 0;
    for (const [pid, cells] of Object.entries(site.quiz.cells as Record<string, Record<string, unknown>[]>))
      cells.forEach((c, k) => {
        for (const pre of ["s", "a"]) {
          if (c[pre] == null) continue;
          n++;
          const w = `${pid} ${qs[k].id} ${pre}`;
          const m = /^([a-z0-9-]+)-evidence\.html#claim-(.+)$/.exec(String(c[pre + "u"] ?? ""));
          const row = m && ev.index[m[2]];
          if (!row || row[0] !== m[1]) {
            errs.push(`${w}: no evidence link (${String(c[pre + "u"])})`);
            continue;
          }
          if (c[pre + "d"] != null ? DMY.test(String(c[pre + "d"])) : /\d{4}/.test(row[1])) continue;
          // no as-of and the claim head shows only its tier (platform pages and the like are undated at the source)
          if (c[pre + "d"] == null && /^מדרגה \d$/.test(row[1])) undated++;
          else errs.push(`${w}: no date (${String(c[pre + "d"] ?? row[1])})`);
        }
      });
    expect(errs).toEqual([]);
    expect([n, undated]).toEqual([480, 28]);
  });

  it("every party and question equals a fresh decode of data.json through assessments and encodeCell", () => {
    const { site, snap } = built();
    const A = assessments(snap.data);
    const decode = (enc: string, pre: "s" | "a") => {
      const [v, conf, imp, reason, date] = enc.split("|");
      const o: Record<string, unknown> = { [pre]: v === "" ? null : Number(v) };
      if (conf === "l" && v !== "") o[pre + "l"] = 1;
      if (imp === "1") o[pre + "i"] = 1;
      if (v === "") o[pre + "x"] = reason || "nf";
      if (date) o[pre + "d"] = date;
      return o;
    };
    const keys = ["s", "a", "sl", "al", "si", "ai", "sx", "ax", "sd", "ad", "g"];
    const pids = Object.keys(site.quiz.cells);
    expect(pids.sort()).toEqual(snap.data.parties.map((p: { id: string }) => p.id).sort());
    let n = 0;
    for (const pid of pids)
      qs.forEach((q, k) => {
        const [s, a] = encodeCell(A.get(`${pid}|${q.sourceQuestionId}|stated`), A.get(`${pid}|${q.sourceQuestionId}|actual`)).split("~");
        const want: Record<string, unknown> = { ...decode(s, "s"), ...decode(a, "a") };
        if (want.s != null && want.a != null && want.s !== want.a) want.g = 1;
        const cell = site.quiz.cells[pid][k];
        const got = Object.fromEntries(keys.filter((x) => x in cell).map((x) => [x, cell[x]]));
        expect(got, `${pid} ${q.id}`).toEqual(want);
        n++;
      });
    expect(n).toBe(15 * 21);
  });

  it("evidence links differ from the 16.10 golden (evA, evB) in exactly the 2 known cells", () => {
    const golden: Record<string, string[]> = { ...json(join(G16, "evA.json")), ...json(join(G16, "evB.json")) };
    const cells = built().site.quiz.cells as Record<string, Record<string, string>[]>;
    const claim = (u: string) => (u.includes("#claim-") ? u.slice(u.indexOf("#claim-") + 7) : "");
    const diffs: string[] = [];
    let n = 0;
    expect(Object.keys(golden).sort()).toEqual(Object.keys(cells).sort());
    for (const [pid, pairs] of Object.entries(golden))
      pairs.forEach((pair, k) => {
        const [gs, ga] = pair.split(" ");
        for (const [pre, g] of [["s", gs], ["a", ga]] as const) {
          n++;
          const mine = claim(cells[pid][k][pre + "u"]);
          if (mine !== g) diffs.push(`${pid} ${qs[k].id} ${pre}: ${g} -> ${mine}`);
        }
      });
    expect(n).toBe(15 * 21 * 2);
    // noam's stated coalition answers rest on a claim on the religious-zionism page; 16.10 linked noam.html
    expect(diffs).toEqual([
      "noam raam_join s:  -> rz-claim-smotrich-raam-disaster-quote-2021-04-02",
      "noam arab_support s:  -> rz-claim-smotrich-raam-disaster-quote-2021-04-02",
    ]);
  });
});

describe("snapshot cross-checks", () => {
  it("every db value quoted in cells, pm and out equals coalDb of the snapshot", () => {
    const DB = coalDb(built().snap.data);
    const qcodes = new Set(Object.values(COAL_Q));
    const quoted: [string, unknown][] = [
      ...[...coal("cells").cells, ...coal("pm").pm].filter((x: { db?: unknown }) => x.db).map((x: { a: string; db: unknown }) => [x.a, x.db] as [string, unknown]),
      ...Object.entries(coal("out").out as Record<string, { db: unknown }>).map(([pid, x]) => [pid, x.db] as [string, unknown]),
    ];
    const errs: string[] = [];
    for (const [pid, db] of quoted) {
      const [q, v] = db as [string, number | null];
      if (!qcodes.has(q)) errs.push(`${pid}: unknown question ${q}`);
      const rec = DB.get(`${pid}|${q}|s`);
      if (!rec || rec.v !== v) errs.push(`${pid} ${q}: quoted ${v}, snapshot ${rec?.v}`);
    }
    expect(errs).toEqual([]);
    expect(quoted).toHaveLength(37 + 14 + 13);
  });

  it("conduct counts equal the conductCheck totals of content/lists.json for every party, plus the 2 events added after its 16.10 read", () => {
    const { site, snap } = built();
    const lists = (site.content.lists as { lists: Record<string, { conductCheck: { total: number; readAt: string } }> }).lists;
    // counted events in the 17.10 snapshot that the 16.10 lists table (and the 16.10 out1 cc) predate
    const after: Record<string, string[]> = {
      "hadash-taal": ["upd-l1017-1300-o1-conduct-abu-shehadeh-terror-supporters-2026-10-05"],
      "religious-zionism": ["upd-l1016-1300-o1-conduct-feiglin-muslim-doctor-2026-10-08"],
    };
    for (const ids of Object.values(after))
      for (const id of ids) expect(snap.data.conductEvents.find((e: { id: string }) => e.id === id)?.classification, id).toBe("counted");
    const out1M = json(join(G16, "out1.json")).M as Record<string, { cc: Record<string, number> }>;
    const parties = site.quiz.parties as { id: string; conduct: { total: number; parts: [string, number][] } }[];
    expect(parties.map((p) => p.id).sort()).toEqual(Object.keys(lists).sort());
    for (const p of parties) {
      const cc = conductCounts(snap.data, p.id);
      const extra = after[p.id]?.length ?? 0;
      expect(lists[p.id].conductCheck.readAt).toBe("2026-10-16");
      expect(sum(cc) - extra, p.id).toBe(lists[p.id].conductCheck.total);
      expect(sum(out1M[p.id].cc), `${p.id} out1`).toBe(lists[p.id].conductCheck.total);
      expect(p.conduct.total, `${p.id} quiz`).toBe(sum(cc));
      expect(p.conduct.parts.map(([, v]) => v).sort(), `${p.id} parts`).toEqual(Object.values(cc).sort());
    }
  });

  it("the built site.json validates against schemas/site.schema.json", () => {
    expect(validateAgainst("site", JSON.parse(built().text))).toEqual([]);
  });
});
