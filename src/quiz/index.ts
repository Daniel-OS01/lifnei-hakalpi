/* Quiz module: home, quiz and results views plus their v5 event handlers. */
import type { Api, Ctx, ViewModule } from "../types";
import { fresh, save, setState, type Basis, type Mode } from "./state";
import { home, quiz, qlist, results, stateOf, summaryText } from "./views";

export * from "./score";
export { fresh, load, save, getState, setState, stateKey } from "./state";
export type { QuizState, Mode, Basis, ReflectAnswer } from "./state";
export { home, quiz, results, summaryText, sideHTML, basisSeg, BASIS_TXT, qlist, quizVars, reflectItems, stateOf } from "./views";

const MINE = ["home", "quiz", "results"];

function bind(root: HTMLElement, getCtx: () => Ctx, api: Api): void {
  const id = () => getCtx().site.election.id;
  const S = () => stateOf(getCtx());
  const persist = () => save(id());
  function startQuiz(mode: Mode) { const b = S().basis; const n = fresh(mode); n.basis = b || "both"; setState(id(), n); persist(); api.show("quiz"); }
  function advance() { S().step++; persist(); api.show("quiz"); }
  function copySummary() {
    const txt = summaryText(getCtx());
    const fallback = () => { const ta = document.createElement("textarea"); ta.value = txt; ta.setAttribute("aria-label", "הסיכום להעתקה"); ta.rows = 8; root.appendChild(ta); ta.focus(); ta.select(); api.toast("ההעתקה האוטומטית לא עבדה. הטקסט מסומן למטה, אפשר להעתיק אותו ידנית."); };
    try { navigator.clipboard.writeText(txt).then(() => { api.toast("הסיכום הועתק"); }, fallback); } catch { fallback(); }
  }

  root.addEventListener("click", (e) => {
    if (MINE.indexOf(api.current()) < 0) return;
    const t = (e.target as Element).closest("button") as HTMLButtonElement | null; if (!t) return;
    const s = S(), q = qlist(getCtx().site.quiz, s)[s.step];
    if (t.dataset.act) {
      const a = t.dataset.act;
      if (a === "start-short") startQuiz("short");
      else if (a === "start-long") startQuiz("long");
      else if (a === "resume") api.show("quiz");
      else if (a === "results") api.show("results");
      else if (a === "home") api.show("home");
      else if (a === "go-decide") api.show("decide");
      else if (a === "go-parties") api.show("parties");
      else if (a === "back") { s.step = Math.max(0, s.step - 1); persist(); api.show("quiz"); }
      else if (a === "next") advance();
      else if (a === "skipq") { s.ans[q.id] = null; advance(); }
      else if (a === "finish") {
        if (s.mode === "short") { s.imp = {}; s.top.forEach((qid) => { s.imp[qid] = 2; }); }
        s.done = true; persist(); api.show("results");
      }
      else if (a === "copy") copySummary();
      return;
    }
    if (t.dataset.basis) { s.basis = t.dataset.basis as Basis; persist(); api.rerender(); api.announce("הדירוג עודכן: " + t.textContent); return; }
    if (t.dataset.ans !== undefined && q && api.current() === "quiz") {
      s.ans[q.id] = t.dataset.ans === "none" ? null : parseFloat(t.dataset.ans); persist();
      if (s.mode === "short") setTimeout(advance, 150); else api.rerender();
      return;
    }
    if (t.dataset.imp && q) { s.imp[q.id] = parseInt(t.dataset.imp, 10); persist(); api.rerender(); return; }
    if (t.dataset.top) {
      const i = s.top.indexOf(t.dataset.top);
      if (i >= 0) s.top.splice(i, 1); else { if (s.top.length >= 2) s.top.shift(); s.top.push(t.dataset.top); }
      persist(); api.rerender(); return;
    }
    if (t.dataset.refl) { const r = s.refl[t.dataset.refl] || {}; r.i = parseInt(t.dataset.rv as string, 10); s.refl[t.dataset.refl] = r; persist(); api.rerender(); return; }
    if (t.dataset.toggle) { const d = root.querySelector<HTMLElement>("#d-" + t.dataset.toggle); if (d) { d.hidden = !d.hidden; t.setAttribute("aria-expanded", String(!d.hidden)); } }
  });
  root.addEventListener("change", (e) => {
    if (MINE.indexOf(api.current()) < 0) return;
    const el = e.target as HTMLInputElement;
    if (el.dataset.red) { const s = S(), q = qlist(getCtx().site.quiz, s)[s.step]; s.red[q.id] = el.checked; persist(); }
  });
  root.addEventListener("input", (e) => {
    if (MINE.indexOf(api.current()) < 0) return;
    const el = e.target as HTMLTextAreaElement, rid = el.dataset.rnote; if (!rid) return;
    const s = S(), r = s.refl[rid] || {}; r.note = el.value; s.refl[rid] = r; persist();
  });
}

export const quizModule: ViewModule = { views: { home, quiz, results }, bind };
