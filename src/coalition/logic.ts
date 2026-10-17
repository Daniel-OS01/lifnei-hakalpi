/* Coalition builder: pure logic ported from v5. Every function takes its inputs explicitly
   (coalition data K, election E, now in ms); nothing here reads globals or storage. */
import type { CoalData, CoalList, Election, Level, Src, Statement } from "../types";
import { inBan } from "../time";
import { dmy, dm } from "../lib/html";

export type Status = "in" | "out" | "sup";
export interface CoalState { seats: Record<string, number>; st: Record<string, Status>; pm: string | null; polls: boolean; sel: string; v: 1 }
export type OutStmt = CoalData["out"][string];
export type Conflict =
  | { k: "pair"; a: string; b: string; c: Statement }
  | { k: "pm"; a: string; b: string; c: Statement }
  | { k: "out" | "outn"; a: string; b: string; c: OutStmt }
  | { k: "supnote"; b: string };
export type Refusal = Extract<Conflict, { c: unknown }>;
export interface Conflicts { hard: Refusal[]; cond: Refusal[]; pmMaybe: Refusal[]; info: Conflict[]; unknown: [string, string][]; pm: string | null }

export const LVN: Record<Level | "U", string> = { X: "פוסלת במפורש", C: "פוסלת בתנאי", N: "לא אמרה", O: "פתוחה", P: "הודיעה על שותפות או המלצה", U: "לא ידוע" };
export const STN: Record<Status, string> = { in: "בקואליציה", out: "מחוץ לה", sup: "תמיכה מבחוץ" };
const has = (o: object, k: unknown) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);

export const ids = (K: CoalData): string[] => K.lists.map((p) => p.id);
export function listOf(K: CoalData, id: string): CoalList {
  return K.lists.find((p) => p.id === id) as CoalList;
}

export function fresh(K: CoalData, E: Election, now: number): CoalState {
  const ban = inBan(now, E), I = ids(K);
  const s: CoalState = { seats: {}, st: {}, pm: null, polls: !ban, sel: I[0], v: 1 };
  I.forEach((id) => { s.seats[id] = ban ? 0 : K.start[id]; s.st[id] = "out"; });
  return s;
}
export function validSeat(E: Election, v: unknown): v is number {
  return typeof v === "number" && isFinite(v) && v === Math.floor(v) && (v === 0 || (v >= E.minSeatsIfPassed && v <= E.totalSeats));
}
export function sanitize(K: CoalData, E: Election, o: unknown, now: number): CoalState {
  const s = fresh(K, E, now);
  if (!o || typeof o !== "object") return s;
  const x = o as { seats?: Record<string, unknown>; st?: Record<string, unknown>; polls?: unknown; pm?: unknown; sel?: unknown };
  const I = ids(K), known = (v: unknown) => typeof v === "string" && I.includes(v);
  I.forEach((id) => {
    if (x.seats && validSeat(E, x.seats[id])) s.seats[id] = x.seats[id] as number;
    if (x.st && has(STN, x.st[id])) s.st[id] = x.st[id] as Status;
  });
  s.polls = !!x.polls;
  s.pm = known(x.pm) ? (x.pm as string) : null;
  if (known(x.sel)) s.sel = x.sel as string;
  // no poll numbers as starting values during the ban
  if (inBan(now, E) && s.polls) { I.forEach((id) => { s.seats[id] = 0; }); s.polls = false; }
  return s;
}

export function sums(K: CoalData, s: CoalState) {
  const r = { coal: 0, sup: 0, total: 0, nIn: 0 };
  ids(K).forEach((id) => {
    const v = s.seats[id]; r.total += v;
    if (s.st[id] === "in") { r.coal += v; r.nIn++; } else if (s.st[id] === "sup") r.sup += v;
  });
  return r;
}
export function setSeat(E: Election, s: CoalState, id: string, v: number | string): { ok: true } | { ok: false; msg: string } {
  const bad = "אפשר להזין רק מספר שלם בין 0 ל-" + E.totalSeats + ".";
  if (typeof v === "string") { v = v.trim(); if (!/^\d{1,3}$/.test(v)) return { ok: false, msg: bad }; v = parseInt(v, 10); }
  if (v >= 1 && v < E.minSeatsIfPassed) return { ok: false, msg: "רשימה שעוברת את אחוז החסימה מקבלת לפחות " + E.minSeatsIfPassed + " מנדטים. אפשר להזין 0 או " + E.minSeatsIfPassed + " ומעלה." };
  if (!validSeat(E, v)) return { ok: false, msg: bad };
  s.seats[id] = v; s.polls = false; return { ok: true };
}
export function step(E: Election, s: CoalState, id: string, dir: number): number {
  let v = s.seats[id];
  if (dir > 0) v = v === 0 ? E.minSeatsIfPassed : Math.min(E.totalSeats, v + 1);
  else v = v <= E.minSeatsIfPassed ? 0 : v - 1;
  s.seats[id] = v; s.polls = false; return v;
}
export function rescale(K: CoalData, E: Election, s: CoalState): boolean {
  const T = E.totalSeats, M = E.minSeatsIfPassed;
  const act = ids(K).filter((id) => s.seats[id] > 0);
  let S = 0; act.forEach((id) => { S += s.seats[id]; });
  if (!S) return false;
  const q: Record<string, number> = {}, base: Record<string, number> = {};
  let used = 0;
  act.forEach((id) => { q[id] = (s.seats[id] * T) / S; base[id] = Math.floor(q[id]); used += base[id]; });
  act.slice().sort((a, b) => q[b] - base[b] - (q[a] - base[a]) || s.seats[b] - s.seats[a]).slice(0, T - used).forEach((id) => { base[id]++; });
  // a list that had seats keeps at least the minimum: lift it and take the seats from the largest lists
  act.forEach((id) => {
    while (base[id] >= 1 && base[id] < M) {
      const donor = act.filter((x) => x !== id && base[x] > M).sort((a, b) => base[b] - base[a])[0];
      if (!donor) break;
      base[donor]--; base[id]++;
    }
  });
  act.forEach((id) => { s.seats[id] = base[id]; });
  s.polls = false; return true;
}
export function back(K: CoalData, E: Election, s: CoalState, now: number): boolean {
  if (inBan(now, E)) return false;
  ids(K).forEach((id) => { s.seats[id] = K.start[id]; });
  s.polls = true; return true;
}
export function clear(K: CoalData, s: CoalState): void {
  ids(K).forEach((id) => { s.seats[id] = 0; s.st[id] = "out"; });
  s.pm = null; s.polls = false;
}
export function cellOf(K: CoalData, a: string, b: string): Statement | null {
  return K.cells.find((c) => c.a === a && c.b === b) || null;
}
export function pmOf(K: CoalData, a: string, h: string): Statement | null {
  return K.pm.find((c) => c.a === a && c.h === h) || null;
}

/* refusals (X, C) between coalition members; PM statements; outside support checked only against the outside-support question */
export function conflicts(K: CoalData, s: CoalState): Conflicts {
  const I = ids(K), inn = I.filter((id) => s.st[id] === "in"), sup = I.filter((id) => s.st[id] === "sup");
  const hard: Refusal[] = [], cond: Refusal[] = [], info: Conflict[] = [], unknown: [string, string][] = [], pmMaybe: Refusal[] = [];
  inn.forEach((a) => { inn.forEach((b) => {
    if (a === b) return;
    const c = cellOf(K, a, b);
    if (!c) { unknown.push([a, b]); return; }
    if (c.lv === "X") hard.push({ k: "pair", a, b, c });
    else if (c.lv === "C") cond.push({ k: "pair", a, b, c });
    else info.push({ k: "pair", a, b, c });
  }); });
  const pm = s.pm && s.st[s.pm] === "in" ? s.pm : null;
  inn.forEach((a) => {
    K.pm.forEach((p) => {
      const h = p.h as string;
      if (p.a !== a || s.st[h] !== "in" || p.a === h) return;
      if (p.lv !== "X" && p.lv !== "C") return;
      if (pm === h) (p.lv === "X" ? hard : cond).push({ k: "pm", a, b: h, c: p });
      else if (!pm) pmMaybe.push({ k: "pm", a, b: h, c: p });
    });
  });
  sup.forEach((b) => {
    if (K.arab.indexOf(b) < 0) { info.push({ k: "supnote", b }); return; }
    inn.forEach((a) => {
      const o = K.out[a]; if (!o) return;
      if (o.lv === "X") hard.push({ k: "out", a, b, c: o });
      else if (o.lv === "N") info.push({ k: "outn", a, b, c: o });
    });
  });
  return { hard, cond, pmMaybe, info, unknown, pm };
}

function allSrc(K: CoalData): Src[] {
  let a: Src[] = [];
  K.cells.concat(K.pm).forEach((c) => { a = a.concat(c.s); (c.st || []).forEach((x) => { a = a.concat(x.s); }); });
  Object.keys(K.out).forEach((k) => { a = a.concat(K.out[k].s); });
  K.lists.forEach((p) => { a = a.concat(p.gov.s); if (p.cond) a = a.concat(p.cond.s); p.nu.forEach((x) => { a = a.concat(x.s); }); });
  K.surplus.forEach((x) => { a = a.concat(x.s); });
  return a;
}
export function claimCount(K: CoalData): number {
  const u: Record<string, 1> = {};
  allSrc(K).forEach((x) => { if (x.e && x.e.indexOf("#claim-") > 0) u[x.e] = 1; });
  return Object.keys(u).length;
}
export function ext(K: CoalData): { only: number; mixed: number } {
  let only = 0, mixed = 0;
  K.cells.concat(K.pm).forEach((c) => {
    const ex = c.s.filter((x) => x.x).length;
    if (ex && ex === c.s.length) only++; else if (ex) mixed++;
  });
  return { only, mixed };
}

function plain(K: CoalData, x: Refusal): string {
  const sn = (id: string) => listOf(K, id).sn;
  if (x.k === "pair" || x.k === "pm") {
    const c = x.c;
    const about = x.k === "pair" ? sn(x.b) : "ממשלה בראשות " + listOf(K, x.b).lead;
    return sn(x.a) + " על " + about + ": " + LVN[c.lv] + (c.cond ? " (התנאי: " + c.cond + ")" : "");
  }
  return sn(x.a) + " על תמיכה מבחוץ של " + sn(x.b) + ": פוסלת במפורש";
}
/** The plain-text scenario for the copy button (v5 kText). */
export function text(K: CoalData, E: Election, s: CoalState): string {
  const sm = sums(K, s), cf = conflicts(K, s), I = ids(K);
  const L = ["תרחיש קואליציה מהכלי \"לפני הקלפי\". זה תרחיש שנבנה ידנית, לא תחזית ולא המלצה."];
  const row = (id: string) => listOf(K, id).sn + ": " + s.seats[id];
  const inn = I.filter((id) => s.st[id] === "in"), sup = I.filter((id) => s.st[id] === "sup");
  const src = "\"" + E.source.nameHe + "\"";
  L.push("בקואליציה (" + sm.coal + " מנדטים מתוך " + E.majority + " הדרושים לרוב): " + (inn.length ? inn.map(row).join(", ") : "אין"));
  if (sup.length) L.push("תמיכה מבחוץ (" + sm.sup + "): " + sup.map(row).join(", "));
  L.push("סך כל המנדטים בתרחיש: " + sm.total + " מתוך " + E.totalSeats + "." + (s.polls ? " המנדטים לפי חציון הסקרים במאגר " + src + " (" + K.lists.map((p) => dm(p.pt)).filter((v, i, a) => a.indexOf(v) === i).join(", ") + ")." : " המנדטים הוזנו ידנית."));
  if (cf.pm) L.push("ראש הממשלה בתרחיש: " + listOf(K, cf.pm).lead + ".");
  const all = cf.hard.concat(cf.cond);
  if (all.length) { L.push("התנגשויות עם הצהרות מתועדות:"); all.forEach((x) => { L.push("- " + plain(K, x) + " (" + dmy((x.c as { d?: string }).d) + ")"); }); }
  else L.push("לא נמצאו התנגשויות עם הצהרות מתועדות" + (cf.pmMaybe.length ? ", אבל יש הצהרות שתלויות בזהות ראש הממשלה." : "."));
  if (cf.pmMaybe.length) cf.pmMaybe.forEach((x) => { L.push("- תלוי בראש הממשלה: " + plain(K, x)); });
  if (cf.unknown.length) L.push("זוגות בלי מידע מתועד: " + cf.unknown.length + ".");
  L.push("הצהרות לפי המאגר " + src + ", נכון ל-" + K.asof + ", ומקורות ראשוניים שסומנו.");
  return L.join("\n");
}
/** The aria-live line after a change (v5 liveLine). */
export function liveLine(K: CoalData, E: Election, s: CoalState): string {
  const sm = sums(K, s);
  return "בקואליציה " + sm.coal + " מתוך " + E.majority + ". סך הכול " + sm.total + " מתוך " + E.totalSeats + ".";
}
