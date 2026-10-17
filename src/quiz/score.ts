/* Scoring and value helpers, ported from v5 as pure functions over the quiz data. */
import type { Cell, Election, Question, QuizData, QuizParty } from "../types";
import type { Basis, QuizState } from "./state";

export function url(D: QuizData, u: string): string { return /^https?:/.test(u) ? u : D.base + u; }
export function fmt(v: number): string { return (v > 0 ? "+" : "") + (Math.round(v * 10) / 10); }
export function valLabel(v: number | null | undefined): string {
  if (v === null || v === undefined) return "אין עמדה";
  if (v >= 1.75) return "בעד מאוד"; if (v >= 0.75) return "בעד"; if (v > -0.75) return "באמצע"; if (v > -1.75) return "נגד"; return "נגד מאוד";
}
export function valClass(v: number | null | undefined): string {
  if (v === null || v === undefined) return "na";
  if (v >= 1.75) return "p2"; if (v >= 0.75) return "p1"; if (v > -0.75) return "z"; if (v > -1.75) return "n1"; return "n2";
}
export function userLabel(u: number): string { if (u >= 1.75) return "מסכים מאוד"; if (u >= 0.75) return "מסכים"; if (u > -0.75) return "באמצע"; if (u > -1.75) return "לא מסכים"; return "לא מסכים בכלל"; }
export const NONE: Record<string, string> = { nc: "לא עמד למבחן", norec: "אין רקורד (רשימה חדשה)", na: "לא נופל על הסולם", nf: "לא נמצאה עמדה" };
export const NONE_SHORT: Record<string, string> = { nc: "לא נבחן", norec: "חדשה", na: "לא חל", nf: "?" };
/** Link to the source database page for a question: its issue page, or the questionnaire when it has none. */
export function issueUrl(e: Election, q: Question): string {
  return e.source.baseUrl + (q.issue ? e.source.issuePath.replace("{issue}", q.issue) : "questionnaire.html");
}
export function noneLabel(x: string | undefined): string { return (x && NONE[x]) || NONE.nf; }

export interface PartyValue { v: number; low: boolean }
/* party value under the chosen basis: said / did / both (mean of the two when both exist) */
export function pval(c: Cell, basis: Basis): PartyValue | null {
  const hasS = c.s !== null && c.s !== undefined, hasA = c.a !== null && c.a !== undefined;
  if (basis === "said") return hasS ? { v: c.s as number, low: !!c.sl } : null;
  if (basis === "did") return hasA ? { v: c.a as number, low: !!c.al } : null;
  if (hasS && hasA) return { v: ((c.s as number) + (c.a as number)) / 2, low: !!(c.sl && c.al) };
  if (hasS) return { v: c.s as number, low: !!c.sl };
  if (hasA) return { v: c.a as number, low: !!c.al };
  return null;
}

export interface ScoreRow { q: Question; u: number; c: Cell; pv: PartyValue | null; a?: number }
export interface ScoreResult { p: QuizParty; pct: number | null; answered: number; covered: number; reds: Question[]; rows: ScoreRow[]; thin: boolean }
export type Answers = Pick<QuizState, "ans" | "imp" | "red">;

export function score(D: QuizData, state: Answers, basis: Basis): ScoreResult[] {
  const res = D.parties.map((p): ScoreResult => {
    const cells = D.cells[p.id], reds: Question[] = [], rows: ScoreRow[] = [];
    let num = 0, den = 0, answered = 0, covered = 0;
    D.questions.forEach((q, i) => {
      const u = state.ans[q.id];
      if (u === undefined || u === null) return;
      answered++;
      const c = cells[i], pv = pval(c, basis);
      let w = state.imp[q.id] || 1;
      if (!pv) { rows.push({ q, u, c, pv: null }); return; }
      covered++;
      const a = 1 - Math.abs(u - pv.v) / 4;
      if (pv.low) w = w * 0.5;
      num += w * a; den += w;
      if (state.red[q.id] && Math.abs(u - pv.v) >= 2.5) reds.push(q);
      rows.push({ q, u, c, pv, a });
    });
    const thin = answered === 0 || covered / answered < 0.5;
    return { p, pct: den && !thin ? Math.round(num / den * 100) : null, answered, covered, reds, rows, thin };
  });
  res.sort((a, b) => {
    if (a.thin !== b.thin) return a.thin ? 1 : -1;
    if (!!a.reds.length !== !!b.reds.length) return a.reds.length ? 1 : -1;
    return (b.pct || 0) - (a.pct || 0);
  });
  return res;
}

export function countValues(D: QuizData): number {
  let n = 0;
  Object.keys(D.cells).forEach((k) => { D.cells[k].forEach((c) => { if (c.s !== null) n++; if (c.a !== null) n++; }); });
  return n;
}
export function coverage(D: QuizData, pid: string): { s: number; a: number; any: number } {
  const c = D.cells[pid]; let s = 0, a = 0, any = 0;
  c.forEach((x) => { if (x.s !== null) s++; if (x.a !== null) a++; if (x.s !== null || x.a !== null) any++; });
  return { s, a, any };
}
