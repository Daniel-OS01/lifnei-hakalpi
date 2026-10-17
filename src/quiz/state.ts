/* Quiz state, ported from v5 (fresh, load, save). One in-memory state per election; every storage access in try/catch. */
import config from "../../config/site.json";

export type Mode = "short" | "long";
export type Basis = "both" | "said" | "did";
export interface ReflectAnswer { i?: number; note?: string }
export interface QuizState {
  mode: Mode | null; step: number; ans: Record<string, number | null>; imp: Record<string, number>;
  red: Record<string, boolean>; top: string[]; refl: Record<string, ReflectAnswer>; done: boolean; basis: Basis;
}

export function stateKey(electionId: string): string { return `${config.storageKeyPrefix}-${electionId}-quiz-v2`; }
export function fresh(mode?: Mode | null): QuizState { return { mode: mode || null, step: 0, ans: {}, imp: {}, red: {}, top: [], refl: {}, done: false, basis: "both" }; }
export function load(electionId: string): QuizState | null {
  try { const r = localStorage.getItem(stateKey(electionId)); return r ? JSON.parse(r) : null; } catch { return null; }
}

const states = new Map<string, QuizState>();
export function getState(electionId: string): QuizState {
  let s = states.get(electionId);
  if (!s) { s = load(electionId) || fresh(); states.set(electionId, s); }
  return s;
}
export function setState(electionId: string, s: QuizState): void { states.set(electionId, s); }
export function save(electionId: string): void {
  try { localStorage.setItem(stateKey(electionId), JSON.stringify(getState(electionId))); } catch { /* storage unavailable */ }
}
