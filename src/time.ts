/* The only place with time logic. Every function takes now (ms) so tests inject the clock. */
import type { Election } from "./types";

export type Phase = "before" | "ban" | "electionDay" | "after";

export function inBan(now: number, e: Election): boolean {
  return now >= Date.parse(e.pollBan.from) && now < Date.parse(e.pollBan.until);
}
/** Local calendar date of a moment in a time zone, as UTC midnight ms of that date. */
function localDay(now: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"));
}
/** Calendar days from today to election day, both in the election's time zone: 0 on election day, 1 the day before. */
export function daysToElection(now: number, e: Election): number {
  return Math.round((Date.parse(e.dateIso + "T00:00:00Z") - localDay(now, e.timezone)) / 86400000);
}
export function afterElection(now: number, e: Election): boolean {
  return now > Date.parse(e.pollsOpen);   // v5: "now > ELECTION" switches to the post-election banner
}
export function phase(now: number, e: Election): Phase {
  if (now >= Date.parse(e.pollsClose)) return "after";
  if (afterElection(now, e)) return "electionDay";
  if (inBan(now, e)) return "ban";
  return "before";
}
