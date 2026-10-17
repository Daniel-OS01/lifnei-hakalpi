// Data pipeline core: snapshot verification, extraction from the source database, and the
// quiz / coalition builders. Ported from the v5 Python scripts (build_data.py, build_coal.py).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { parse } from "node-html-parser";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export const sha256 = (b: Buffer | string): string => createHash("sha256").update(b).digest("hex");
/** SHA-256 after trimming trailing newlines, as the v5 hashes were computed. */
export const sha256Trim = (s: string): string => sha256(s.replace(/\n+$/, ""));
const readJson = (p: string): Any => JSON.parse(readFileSync(p, "utf8"));

export function fail(msg: string): never {
  throw new Error(msg);
}
function check(cond: unknown, msg: string): asserts cond {
  if (!cond) fail(msg);
}

/** yyyy-mm-dd -> d.m.yyyy */
export const dmy = (iso: string | null | undefined): string =>
  iso ? iso.split("-").reverse().map((x, i) => (i < 2 ? String(Number(x)) : x)).join(".") : "";

const DASH_RE = /[\u2013\u2014\u2015]/;
/** build_coal.py nodash, applied to source-derived text. */
export function nodash<T>(o: T): T {
  if (typeof o === "string") return o.replace(/ \u2013 /g, ", ").replace(/\u2013/g, "-").replace(/\u2014/g, ", ") as T;
  if (Array.isArray(o)) return o.map(nodash) as T;
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, nodash(v)])) as T;
  return o;
}
export function assertNoDashes(text: string, where: string): void {
  const m = DASH_RE.exec(text);
  if (m) fail(`dash character U+${m[0].charCodeAt(0).toString(16).toUpperCase()} in ${where} near: ${text.slice(Math.max(0, m.index - 40), m.index + 40)}`);
}

// ---------------------------------------------------------------- snapshot

export interface Snapshot {
  dir: string;
  manifest: Any;
  data: Any;
  dataSha: string;
  evidence: Record<string, string>; // pid -> html
}

/** Verify every file listed in manifest.json and every evidence page against its hash; throw on any mismatch. */
export function loadSnapshot(dir: string): Snapshot {
  const mp = join(dir, "manifest.json");
  check(existsSync(mp), `snapshot refused: ${mp} is missing`);
  const manifest = readJson(mp);
  const files: Record<string, string> = manifest.files ?? {};
  check(Object.keys(files).length > 0, `snapshot refused: manifest ${mp} lists no files`);
  for (const [rel, want] of Object.entries(files)) {
    const p = join(dir, rel);
    check(existsSync(p), `snapshot refused: ${rel} is listed in the manifest but missing`);
    const got = sha256(readFileSync(p));
    check(got === want, `snapshot refused: SHA-256 mismatch for ${rel} (manifest ${want}, file ${got})`);
  }
  const evDir = join(dir, "evidence-html");
  const onDisk = existsSync(evDir) ? readdirSync(evDir).filter((f) => f.endsWith(".html.gz")) : [];
  for (const f of onDisk) check(`evidence-html/${f}` in files, `snapshot refused: evidence-html/${f} is not in the manifest`);
  check("data.json" in files, "snapshot refused: manifest has no data.json");
  const raw = readFileSync(join(dir, "data.json"));
  const data = JSON.parse(raw.toString("utf8"));
  const evidence: Record<string, string> = {};
  const evSha: Record<string, string> = manifest.evidenceHtmlSha256 ?? {};
  for (const p of data.parties) {
    const rel = `evidence-html/${p.id}-evidence.html.gz`;
    check(rel in files, `snapshot refused: no evidence page for ${p.id}`);
    const html = gunzipSync(readFileSync(join(dir, rel)));
    const want = evSha[`${p.id}-evidence.html`];
    check(want, `snapshot refused: manifest has no uncompressed hash for ${p.id}-evidence.html`);
    check(sha256(html) === want, `snapshot refused: uncompressed SHA-256 mismatch for ${p.id}-evidence.html`);
    evidence[p.id] = html.toString("utf8");
  }
  return { dir, manifest, data, dataSha: sha256(raw), evidence };
}

// ---------------------------------------------------------------- extraction

export const REASON: Record<string, string> = { not_found: "nf", no_occasion: "nc", no_record: "norec", not_on_scale: "na" };
export const COAL_Q: Record<string, string> = {
  "q-netanyahu-government": "BB",
  "q-raam-coalition": "RAAM",
  "q-arab-parties-outside-support": "OUT",
  "q-haredi-parties-coalition": "HAR",
};

export type ClaimRow = [page: string, date: string, status: string, url: string, outlet: string];

/** Index every claim on every evidence page: id -> [page, date, status, first source href, outlet]. */
export function claimIndex(data: Any, evidence: Record<string, string>): { index: Record<string, ClaimRow>; ids: Record<string, Set<string>> } {
  const index: Record<string, ClaimRow> = {};
  const ids: Record<string, Set<string>> = {};
  for (const p of data.parties) {
    const root = parse(evidence[p.id]);
    const own = new Set<string>();
    for (const el of root.querySelectorAll("[id]")) {
      const id = el.getAttribute("id") ?? "";
      if (id.startsWith("claim-")) own.add(id.slice(6));
    }
    ids[p.id] = own;
    for (const d of root.querySelectorAll("details.claim")) {
      const id = d.getAttribute("id") ?? "";
      if (!id.startsWith("claim-")) continue;
      const cid = id.slice(6);
      if (cid in index) continue;
      const spans = d.querySelector("summary .head")?.querySelectorAll("span") ?? [];
      const a = d.querySelector(".src a");
      let outlet = "";
      if (a?.parentNode) {
        const sibs = a.parentNode.childNodes;
        const next = sibs[sibs.indexOf(a) + 1];
        outlet = next ? next.text.replace(/^[,\s]+/, "").replace(/\s+$/, "") : "";
      }
      index[cid] = [p.id, spans[1]?.text ?? "", spans[0]?.text ?? "", a?.getAttribute("href") ?? "", outlet];
    }
  }
  return { index, ids };
}

/** The golden meta.json chunk, with the previous-Knesset faction read from the source field election.json
    source.fields.prevFaction names (the golden file calls it k25). */
export function metaChunk(data: Any, prevFactionField: string): Any[] {
  const people: Record<string, Any> = Object.fromEntries(data.people.map((x: Any) => [x.id, x]));
  for (const p of data.parties) check(prevFactionField in p, `party ${p.id} has no field ${prevFactionField} (election.json source.fields.prevFaction)`);
  return data.parties.map((p: Any) => ({
    id: p.id, n: p.name_he, sn: p.short_name_he, l: p.ballot_letters, lead: people[p.leader_id].name_he, leadId: p.leader_id,
    cp: p.constituent_parties_he, prevFaction: p[prevFactionField], sw: p.seat_window, upd: p.last_updated, polls: p.polls,
    bt: p.__poll_standing && p.__poll_standing.below_threshold_pct,
  }));
}

/** The golden coal.txt chunk. */
export function coalChunk(data: Any): string {
  return data.positionAssessments
    .filter((a: Any) => a.question_id in COAL_Q)
    .map((a: Any) =>
      [a.party_id, COAL_Q[a.question_id], a.dimension[0], a.value ?? "", (a.confidence || "")[0] || "", REASON[a.unknown_reason] || "",
        a.implied ? 1 : "", a.changed_from != null ? `${a.changed_from}@${a.changed_at}` : "", a.claim_ids?.[0] || ""].join("|"))
    .join("\n");
}

/** Assessment lookup keyed party|question|dimension. */
export function assessments(data: Any): Map<string, Any> {
  const m = new Map<string, Any>();
  for (const a of data.positionAssessments) m.set(`${a.party_id}|${a.question_id}|${a.dimension}`, a);
  return m;
}

/** out1.json V encoding of one cell. */
export function encodeCell(stated: Any, actual: Any): string {
  const enc = (x: Any) =>
    [x.value == null ? "" : x.value, (x.confidence || "")[0] || "", x.implied ? 1 : 0, x.value == null ? REASON[x.unknown_reason] || "" : "", dmy(x.as_of)].join("|");
  return `${enc(stated)}~${enc(actual)}`;
}

/** Conduct counts per kind (classification "counted" only). */
export const CONDUCT_KINDS = ["falsehood", "conspiracy", "attack"] as const;
export function conductCounts(data: Any, pid: string): Record<string, number> {
  const mine = new Set([pid, ...data.people.filter((x: Any) => x.party_id === pid).map((x: Any) => x.id)]);
  const cc: Record<string, number> = {};
  for (const e of data.conductEvents) {
    if (!mine.has(e.subject?.id) || e.classification !== "counted") continue;
    if (!(CONDUCT_KINDS as readonly string[]).includes(e.kind)) continue;
    cc[e.kind] = (cc[e.kind] ?? 0) + 1;
  }
  return cc;
}

/** out1.json M entry (the fields the quiz uses). */
export function partyMeta(data: Any, pid: string): Any {
  const p = data.parties.find((x: Any) => x.id === pid);
  const cov = p.__coverage ?? {};
  const top = data.people
    .filter((x: Any) => x.party_id === pid && x.list_position != null)
    .sort((a: Any, b: Any) => a.list_position - b.list_position)
    .slice(0, 5)
    .map((x: Any) => x.name_he);
  return {
    bl: p.ballot_letters, web: p.website, sw: p.seat_window,
    bt: (p.__poll_standing?.below_threshold_pct ?? []).map((b: Any) => `${b.outlet} ${b.pct}% ${b.at}`),
    nwp: !!p.research_coverage?.no_written_platform,
    cov: { leader: cov.leader, top10: cov.top10_profiles, stances: cov.wedge_stances, conduct: cov.conduct_monitoring, body: cov.party_as_body, platform: cov.platform },
    cc: conductCounts(data, pid), top,
  };
}

// ---------------------------------------------------------------- quiz

const KIND_HE: Record<string, string> = { falsehood: "אמירות שקריות", conspiracy: "קונספירציות", attack: "תקיפות אישיות" };

export function quizOrder(data: Any): string[] {
  return data.parties
    .map((p: Any) => p)
    .sort((a: Any, b: Any) => b.seat_window.median - a.seat_window.median || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((p: Any) => p.id);
}

export function buildQuiz(snap: Snapshot, questions: Any, lists: Any, base: string, ev: { index: Record<string, ClaimRow>; ids: Record<string, Set<string>> }): Any {
  const { data } = snap;
  const A = assessments(data);
  const qs: Any[] = questions.questions;
  check(qs.length === 21, `questions.json must hold 21 questions, has ${qs.length}`);
  const sourceQ = new Set(data.questions.map((q: Any) => q.id));
  for (const q of qs) {
    check(sourceQ.has(q.sourceQuestionId), `question ${q.id}: source question ${q.sourceQuestionId} not in the snapshot`);
    check(q.cat in questions.cats, `question ${q.id}: unknown category ${q.cat}`);
  }
  for (const s of questions.short) check(qs.some((q) => q.id === s), `short set: unknown question ${s}`);
  const order = quizOrder(data);
  const link = (pid: string, a: Any) => {
    const ids: string[] = a.claim_ids ?? [];
    const hit = ids.find((c) => ev.ids[pid].has(c));
    if (hit) return `${pid}-evidence.html#claim-${hit}`;
    // a claim held on another list's evidence page (as the coalition tab links it), else the party page
    const other = ids.find((c) => c in ev.index);
    return other ? `${ev.index[other][0]}-evidence.html#claim-${other}` : `${pid}.html`;
  };
  const cells: Record<string, Any[]> = {};
  for (const pid of order) {
    cells[pid] = qs.map((q) => {
      const s = A.get(`${pid}|${q.sourceQuestionId}|stated`);
      const a = A.get(`${pid}|${q.sourceQuestionId}|actual`);
      check(s && a, `no assessment for ${pid} ${q.sourceQuestionId}`);
      const c: Any = { s: s.value ?? null, a: a.value ?? null };
      for (const [pre, x] of [["s", s], ["a", a]] as const) {
        if ((x.confidence || "")[0] === "l" && x.value != null) c[pre + "l"] = 1;
        if (x.implied) c[pre + "i"] = 1;
        if (x.value == null) c[pre + "x"] = REASON[x.unknown_reason] || "nf";
        if (x.as_of) c[pre + "d"] = dmy(x.as_of);
      }
      c.su = link(pid, s);
      c.au = link(pid, a);
      if (c.s != null && c.a != null && c.s !== c.a) c.g = 1;
      return c;
    });
  }
  const parties = order.map((pid) => {
    const m = partyMeta(data, pid);
    const L = lists.lists[pid];
    check(L, `content/lists.json has no entry for ${pid}`);
    const sw = m.sw;
    const total = Object.values(m.cc as Record<string, number>).reduce((x, y) => x + y, 0);
    const parts = Object.entries(m.cc as Record<string, number>).sort((x, y) => y[1] - x[1]).map(([k, v]) => [KIND_HE[k], v]);
    const th = sw.median === 0 ? "below" : sw.low === 0 ? "near" : null;
    const p: Any = {
      id: pid, n: L.n, l: L.l, letters: m.bl, th, cand: L.cand, site: m.web || null, top: nodash(m.top),
      seats: { median: sw.median, low: sw.low, high: sw.high, n: sw.n, from: sw.from, to: sw.to },
      below: nodash(m.bt), conduct: { total, parts }, legal: L.legal, documented: L.documented, cov: m.cov,
    };
    for (const k of ["pl", "pt", "src"]) if (k in L) p[k] = L[k];
    return p;
  });
  return {
    base, asof: dmy(snap.manifest.date), srcBuilt: data.builtAt,
    questions: qs.map((q) => ({ id: q.id, cat: q.cat, title: q.title, label: q.label, stmt: q.stmt, issue: q.issue ?? null })),
    short: questions.short, parties, cells, cats: questions.cats,
  };
}

// ---------------------------------------------------------------- coalition

interface Rec { v: number | null; c: string | null; r: string | null; im: boolean; ch: string | null; first: string | null }
export function coalDb(data: Any): Map<string, Rec> {
  const db = new Map<string, Rec>();
  for (const line of coalChunk(data).split("\n")) {
    const [p, q, d, v, c, r, im, ch, first] = line.split("|");
    db.set(`${p}|${q}|${d}`, { v: v === "" ? null : Number(v), c: c || null, r: r || null, im: !!im, ch: ch || null, first: first || null });
  }
  return db;
}

export function buildCoalition(snap: Snapshot, C: Record<string, Any>, election: Any, claims: Record<string, ClaimRow>): Any {
  const { data } = snap;
  const BASE: string = election.source.baseUrl;
  const meta = nodash(metaChunk(data, election.source.fields.prevFaction));
  const IDS = meta.map((p: Any) => p.id);
  const DB = coalDb(data);
  check(DB.size === IDS.length * 8, `coalition questions: expected ${IDS.length * 8} assessments, found ${DB.size}`);
  const issue: string = C.meta.issue;
  const src = (items: Any[]): Any[] =>
    items.map((s) => {
      if (s && typeof s === "object") {
        check(s.u && s.o && /^\d{4}-\d{2}-\d{2}$/.test(s.d), `external source needs u, o and an ISO date: ${JSON.stringify(s)}`);
        return { u: s.u, o: `${s.o}, ${dmy(s.d)}`, x: 1 };
      }
      if (s.startsWith("issues/")) return { e: BASE + s, o: "עמוד הקווים האדומים במאגר" };
      check(s in claims, `claim not found on any evidence page: ${s}`);
      const [pg, , , u, o] = claims[s];
      return { e: `${BASE}parties/${pg}-evidence.html#claim-${s}`, u, o };
    });
  const dbcheck = (x: Any) => {
    if (!x.db) return null;
    const [q, v] = x.db;
    const rec = DB.get(`${x.a}|${q}|s`);
    check(rec, `db: no assessment ${x.a} ${q}`);
    check(rec.v === v, `db mismatch ${x.a} ${q}: file ${rec.v}, cell ${v}`);
    return { q, v, c: rec.c, im: rec.im };
  };
  const LV = new Set("XCNOP");
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const stmtChecks = (x: Any, what: string) => {
    check(LV.has(x.lv), `${what}: level ${x.lv} not in X|C|N|O|P`);
    check(ISO.test(x.d ?? ""), `${what}: needs an ISO date`);
    if (x.lv === "C") check(x.cond, `${what}: conditional refusal needs its condition`);
    check(Array.isArray(x.src) && x.src.length > 0, `${what}: needs at least one source`);
  };
  const stages = (x: Any, what: string) =>
    (x.st ?? []).map((s: Any, i: number) => {
      stmtChecks(s, `${what} stage ${i}`);
      return { lv: s.lv, d: s.d, t: s.t, cond: s.cond ?? null, s: src(s.src) };
    });
  const seen = new Set<string>();
  const cells = C.cells.cells.map((x: Any) => {
    const w = `cell ${x.a}->${x.b}`;
    check(IDS.includes(x.a) && IDS.includes(x.b) && x.a !== x.b, `${w}: unknown or identical lists`);
    check(!seen.has(`${x.a}|${x.b}`), `duplicate cell ${x.a}->${x.b}`);
    seen.add(`${x.a}|${x.b}`);
    stmtChecks(x, w);
    return { a: x.a, b: x.b, lv: x.lv, d: x.d, t: x.t, cond: x.cond ?? null, s: src(x.src), db: dbcheck(x), gen: !!x.gen, rep: !!x.rep, st: stages(x, w) };
  });
  const pm = C.pm.pm.map((x: Any) => {
    const w = `pm ${x.a}->${x.h}`;
    check(IDS.includes(x.a) && IDS.includes(x.h), `${w}: unknown lists`);
    stmtChecks(x, w);
    return { a: x.a, h: x.h, lv: x.lv, d: x.d, t: x.t, cond: x.cond ?? null, s: src(x.src), db: dbcheck(x), rep: !!x.rep, st: stages(x, w) };
  });
  const out: Any = {};
  for (const [pid, x] of Object.entries(C.out.out as Record<string, Any>)) {
    const rec = DB.get(`${pid}|OUT|s`)!;
    check(rec, `OUT: no assessment for ${pid}`);
    check(rec.v === x.db[1], `OUT db mismatch ${pid}: file ${rec.v}, entry ${x.db[1]}`);
    // level must follow the database value: -2 -> X, +1/+2 -> P, -1/0/null -> N (no explicit statement)
    let exp = rec.v === -2 ? "X" : rec.v != null && rec.v >= 1 && pid === "hademokratim" ? "P" : "N";
    if (pid === "utj" || pid === "noam") exp = "N"; // rests on words of someone who does not head this list today
    if (pid === "likud") exp = "N"; // attacks a rival government; does not say Likud would refuse such support
    check(x.lv === exp, `OUT level for ${pid} should be ${exp}`);
    check(x.src?.length, `OUT ${pid}: needs a source`);
    out[pid] = { lv: x.lv, t: x.t, s: src(x.src), v: rec.v, c: rec.c, im: rec.im };
  }
  const gaps: Record<string, string[]> = {};
  const cq: Any = {};
  for (const pid of IDS) {
    for (const q of ["BB", "RAAM", "OUT", "HAR"]) {
      const s = DB.get(`${pid}|${q}|s`)!, a = DB.get(`${pid}|${q}|a`)!;
      (cq[pid] ??= {})[q] = {
        s: s.v, sc: s.c, sr: s.r, si: s.im, sch: s.ch, su: s.first ? src([s.first])[0].e : BASE + issue,
        a: a.v, ac: a.c, ar: a.r, au: a.first ? src([a.first])[0].e : BASE + issue,
      };
      if (s.v != null && a.v != null && Math.abs(s.v - a.v) >= 2) (gaps[pid] ??= []).push(q);
    }
  }
  const L = C.lists;
  const key = (p: Any) => p.sn.replace(/"/g, "");
  const lists = [...meta].sort((x: Any, y: Any) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0)).map((p: Any) => {
    const sw = p.sw;
    check(L.gov[p.id], `coalition/lists.json: no gov entry for ${p.id}`);
    return {
      id: p.id, n: p.n, sn: p.sn, l: p.l, lead: p.lead, cp: p.cp || [], prevFaction: p.prevFaction ?? null,
      med: sw.median, lo: sw.low, hi: sw.high, pn: sw.n, pf: sw.from, pt: sw.to, outlets: p.polls[0].pollster, bt: p.bt || [],
      gov: { t: L.gov[p.id].t, s: src(L.gov[p.id].src) },
      cond: L.cond[p.id] ? { t: L.cond[p.id].t, s: src(L.cond[p.id].src) } : null,
      nu: (L.nuance[p.id] ?? []).map((n: Any) => ({ t: n.t, s: src(n.src) })),
      gaps: gaps[p.id] ?? [],
    };
  });
  const start: Record<string, number> = {};
  for (const p of meta) {
    const v = Math.trunc(p.sw.median); // half medians rounded down
    check(!(v >= 1 && v <= 3), `start below threshold for ${p.id}`);
    start[p.id] = v;
  }
  return nodash({
    asof: dmy(snap.manifest.date), srcBuilt: data.builtAt, srcVer: snap.manifest.sourceVersion ?? null, srcSha: snap.dataSha,
    base: BASE, issue: BASE + issue, polls: BASE + election.source.pollsPath,
    ban: { f: election.pollBan.from, u: election.pollBan.until },
    lists, start, cells, pm, out, arab: C.out.arab, qt: C.meta.qt, cq,
    surplus: C.surplus.surplus.map((s: Any) => ({ a: s.a, b: s.b, d: s.d, s: src(s.src) })),
    surplusNone: { lists: C.surplus.none.lists, t: C.surplus.none.t, s: src(C.surplus.none.src) },
    scen: C.scenarios.scen,
  });
}

export function readDir(dir: string, ext: string): Record<string, string> {
  if (!existsSync(dir)) return {};
  return Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(ext)).sort().map((f) => [f.slice(0, -ext.length), join(dir, f)]));
}
export { readJson };
