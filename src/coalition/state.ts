/* Coalition state, ported from v5 (kLoad, kSave). One in-memory state per election, loaded lazily
   through logic.sanitize; every storage access in try/catch. */
import config from "../../config/site.json";
import type { CoalData, Ctx, Election } from "../types";
import { fresh, sanitize, type CoalState } from "./logic";

export function stateKey(electionId: string): string { return `${config.storageKeyPrefix}-${electionId}-coal-v1`; }
export function load(K: CoalData, E: Election, now: number): CoalState {
  try { const r = localStorage.getItem(stateKey(E.id)); return sanitize(K, E, r ? JSON.parse(r) : null, now); } catch { return fresh(K, E, now); }
}

const states = new Map<string, CoalState>();
export function getState(K: CoalData, E: Election, now: number): CoalState {
  let s = states.get(E.id);
  if (!s) { s = load(K, E, now); states.set(E.id, s); }
  return s;
}
export function setState(electionId: string, s: CoalState): void { states.set(electionId, s); }
export function save(electionId: string): void {
  const s = states.get(electionId); if (!s) return;
  try { localStorage.setItem(stateKey(electionId), JSON.stringify(s)); } catch { /* storage unavailable */ }
}
export function stateOf(ctx: Ctx): CoalState { return getState(ctx.site.coalition, ctx.site.election, ctx.now); }
