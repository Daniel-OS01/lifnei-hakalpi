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
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Stored JSON to a state: each field is kept only when it has v5's shape, otherwise it takes the fresh() value. */
function valid(o: unknown): QuizState {
  const s = fresh();
  if (!isObj(o)) return s;
  if (o.mode === "short" || o.mode === "long") s.mode = o.mode;
  if (typeof o.step === "number" && Number.isInteger(o.step) && o.step >= 0) s.step = o.step;
  if (isObj(o.ans)) s.ans = o.ans as QuizState["ans"];
  if (isObj(o.imp)) s.imp = o.imp as QuizState["imp"];
  if (isObj(o.red)) s.red = o.red as QuizState["red"];
  if (isObj(o.refl)) s.refl = o.refl as QuizState["refl"];
  if (Array.isArray(o.top) && o.top.every((t) => typeof t === "string")) s.top = o.top;
  if (typeof o.done === "boolean") s.done = o.done;
  if (o.basis === "both" || o.basis === "said" || o.basis === "did") s.basis = o.basis;
  return s;
}
export function load(electionId: string): QuizState | null {
  try { const r = localStorage.getItem(stateKey(electionId)); return r ? valid(JSON.parse(r)) : null; } catch { return null; }
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
