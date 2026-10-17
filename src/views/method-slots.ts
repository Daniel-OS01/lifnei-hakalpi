/* Every number the method text shows, computed from site data (v5 methodCounts, evidenceCount, coal.js kClaimCount, kExt). */
import type { SiteData, Src, Cell } from "../types";
import { dmy, electionVars } from "../lib/html";

export function missingCounts(site: SiteData) {
  const c: Record<string, number> = { nc: 0, nf: 0, norec: 0, na: 0 }; let v = 0;
  const q = site.quiz;
  q.parties.forEach((p) => q.cells[p.id].forEach((x: Cell) => (["s", "a"] as const).forEach((k) => {
    if (x[k] === null) c[x[(k + "x") as "sx" | "ax"] as string]++; else v++;
  })));
  return { values: v, missing: c.nc + c.nf + c.norec + c.na, ...c } as { values: number; missing: number; nc: number; nf: number; norec: number; na: number };
}
export function methodCounts(site: SiteData): string {
  const m = missingCounts(site), q = site.quiz;
  return "מתוך " + (m.values + m.missing) + " הערכים האפשריים (" + q.parties.length + " רשימות, " + q.questions.length + " היגדים, שני ממדים), ל-" + m.values + " יש ערך. לכל אחד מ-" + m.missing + " החסרים המאגר נותן סיבה, והכלי מציג אותה: לא נמצאה עמדה (" + m.nf + "), הנושא לא עמד למבחן (" + m.nc + "), רשימה חדשה בלי רקורד (" + m.norec + "), או רקורד שלא נופל על הסולם (" + m.na + ").";
}
export function evidenceCount(site: SiteData): number {
  let n = 0; const q = site.quiz;
  q.parties.forEach((p) => q.cells[p.id].forEach((x) => (["su", "au"] as const).forEach((k) => {
    if (x[k].indexOf("#claim-") > 0 && x[k === "su" ? "s" : "a"] !== null) n++;
  })));
  return n;
}
function allSrc(site: SiteData): Src[] {
  const K = site.coalition; let a: Src[] = [];
  K.cells.concat(K.pm).forEach((c) => { a = a.concat(c.s); (c.st || []).forEach((x) => { a = a.concat(x.s); }); });
  Object.keys(K.out).forEach((k) => { a = a.concat(K.out[k].s); });
  K.lists.forEach((p) => { a = a.concat(p.gov.s); if (p.cond) a = a.concat(p.cond.s); p.nu.forEach((x) => { a = a.concat(x.s); }); });
  K.surplus.forEach((x) => { a = a.concat(x.s); });
  return a;
}
export function claimCount(site: SiteData): number {
  const u: Record<string, 1> = {}; allSrc(site).forEach((x) => { if (x.e && x.e.indexOf("#claim-") > 0) u[x.e] = 1; }); return Object.keys(u).length;
}
export function extCounts(site: SiteData): { only: number; mixed: number } {
  let only = 0, mixed = 0; const K = site.coalition;
  K.cells.concat(K.pm).forEach((c) => { const ex = c.s.filter((x) => x.x).length; if (ex && ex === c.s.length) only++; else if (ex) mixed++; });
  return { only, mixed };
}
/** Slot values for docs/method.md and content/method-notes.md. */
export function methodSlots(site: SiteData): Record<string, string | number> {
  const K = site.coalition, L = K.lists.length, e = site.election, ext = extCounts(site);
  return {
    ...electionVars(e), methodCounts: methodCounts(site), evidenceCount: evidenceCount(site), claimCount: claimCount(site),
    extOnly: ext.only, extMixed: ext.mixed, cellCount: K.cells.length, pmCount: K.pm.length,
    pairCount: L * (L - 1), coalListCount: L, otherCount: L - 1, unknownPairs: L * (L - 1) - K.cells.length,
    listCount: site.quiz.parties.length, questionCount: site.quiz.questions.length, shortCount: site.quiz.short.length,
    quizAsof: site.quiz.asof, quizSrcBuilt: site.quiz.srcBuilt, coalSrcBuilt: K.srcBuilt, coalSrcVer: K.srcVer, srcShaShort: K.srcSha.slice(0, 16),
    sourceName: e.source.nameHe, sourceAuthor: e.source.author, sourceBaseUrl: e.source.baseUrl, buildDate: dmy(site.build.builtAt),
  };
}
