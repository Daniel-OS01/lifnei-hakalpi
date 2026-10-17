/* Small shared helpers, ported verbatim from v5. */
export function esc(s: unknown): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);
}
/** ISO date or datetime -> d.m.yyyy (v5 kd) */
export function dmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || "");
  return m ? +m[3] + "." + +m[2] + "." + m[1] : esc(iso || "");
}
/** ISO date -> d.m (v5 pctDate / pctD) */
export function dm(iso: string): string {
  return iso.replace(/(\d{4})-(\d\d)-(\d\d)/, (_m, _y, mo, d) => +d + "." + +mo);
}
/** Fills {{name}} placeholders from vars; unknown names are left as is so tests can catch them. */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
/** Placeholder values every content text may use, all derived from election.json. */
export function electionVars(e: import("../types").Election): Record<string, string | number> {
  return {
    thresholdPct: e.thresholdPct, totalSeats: e.totalSeats, majority: e.majority, minSeats: e.minSeatsIfPassed,
    knessetNumber: e.knessetNumber, prevKnessetNumber: e.knessetNumber - 1, electionDate: dmy(e.dateIso), year: e.dateIso.slice(0, 4),
    banFrom: dmy(e.pollBan.from), banUntil: dmy(e.pollBan.until),
  };
}
