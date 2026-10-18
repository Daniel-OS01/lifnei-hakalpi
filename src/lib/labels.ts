/* v5 value labels and link helpers, ported verbatim. */
import type { Election, Question } from "../types";

export const NONE: Record<string, string> = { nc: "לא עמד למבחן", norec: "אין רקורד (רשימה חדשה)", na: "לא נופל על הסולם", nf: "לא נמצאה עמדה" };
export const NONE_SHORT: Record<string, string> = { nc: "לא נבחן", norec: "חדשה", na: "לא חל", nf: "?" };

/** Absolute URLs pass through; relative ones are resolved against base (v5 url, base was D.base). */
export function url(u: string, base: string): string { return /^https?:/.test(u) ? u : base + u; }
export function fmt(v: number): string { return (v > 0 ? "+" : "") + Math.round(v * 10) / 10; }
export function valLabel(v: number | null | undefined): string {
  if (v === null || v === undefined) return "אין עמדה";
  if (v >= 1.75) return "בעד מאוד"; if (v >= 0.75) return "בעד"; if (v > -0.75) return "באמצע"; if (v > -1.75) return "נגד"; return "נגד מאוד";
}
export function valClass(v: number | null | undefined): string {
  if (v === null || v === undefined) return "na";
  if (v >= 1.75) return "p2"; if (v >= 0.75) return "p1"; if (v > -0.75) return "z"; if (v > -1.75) return "n1"; return "n2";
}
export function userLabel(u: number): string { if (u >= 1.75) return "מסכים מאוד"; if (u >= 0.75) return "מסכים"; if (u > -0.75) return "באמצע"; if (u > -1.75) return "לא מסכים"; return "לא מסכים בכלל"; }
export function noneLabel(x: string | undefined): string { return (x && NONE[x]) || NONE.nf; }
/** v5 issueUrl: the source's issue page for the question, or its questionnaire page when it has none. */
export function issueUrl(q: Question, e: Election): string {
  return e.source.baseUrl + (q.issue ? e.source.issuePath.replace("{issue}", q.issue) : "questionnaire.html");
}
