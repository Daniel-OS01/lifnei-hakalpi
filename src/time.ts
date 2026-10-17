/* The only place with time logic. Every function takes now (ms) so tests inject the clock. */
import type { Election } from "./types";

export type Phase = "before" | "ban" | "electionDay" | "after";

export function inBan(now: number, e: Election): boolean {
  return now >= Date.parse(e.pollBan.from) && now < Date.parse(e.pollBan.until);
}
/** v5 rule: days = ceil((polls open - now) / 1 day) */
export function daysToElection(now: number, e: Election): number {
  return Math.ceil((Date.parse(e.pollsOpen) - now) / 86400000);
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
