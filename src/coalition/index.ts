/* Coalition module: the coalition tab view plus its v5 event handlers. */
import type { Api, Ctx, ViewModule } from "../types";
import { back, clear, conflicts, listOf, liveLine, rescale, setSeat, step, text, STN, ids, type Status } from "./logic";
import { save, stateOf } from "./state";
import { coalition } from "./views";

export * from "./logic";
export { stateKey, load, getState, setState, save, stateOf } from "./state";
export {
  coalition, coalVars, lawLinks, srcLinks, stmtHTML, rowHTML, sumWarnHTML, counterBody, counterNote, conflictsHTML,
  scenSources, scenHTML, matrixHTML, gridHTML, cardHTML, formationHTML,
} from "./views";
export type { CoalContent, FormationContent } from "./views";

function bind(root: HTMLElement, getCtx: () => Ctx, api: Api): void {
  const mine = () => api.current() === "coalition";
  const K = () => getCtx().site.coalition, E = () => getCtx().site.election;
  const S = () => stateOf(getCtx());
  const persist = () => save(E().id);
  const live = () => liveLine(K(), E(), S());
  const sn = (id: string) => listOf(K(), id).sn;
  function copyScenario() {
    const txt = text(K(), E(), S());
    const fallback = () => {
      const ta = document.createElement("textarea"); ta.value = txt; ta.setAttribute("aria-label", "התרחיש להעתקה"); ta.rows = 10;
      (root.querySelector("#k-copybox") || root).appendChild(ta); ta.focus(); ta.select();
      api.toast("ההעתקה האוטומטית לא עבדה. הטקסט מסומן, אפשר להעתיק אותו ידנית.");
    };
    try { navigator.clipboard.writeText(txt).then(() => { api.toast("התרחיש הועתק"); }, fallback); } catch { fallback(); }
  }

  root.addEventListener("click", (e) => {
    if (!mine()) return;
    const t = (e.target as Element).closest("button") as HTMLButtonElement | null; if (!t) return;
    const s = S(), id = t.dataset.kid as string;
    if (t.dataset.kstep) { const v = step(E(), s, id, parseInt(t.dataset.kstep, 10)); persist(); api.rerender(); api.announce(sn(id) + ": " + v + " מנדטים. " + live()); return; }
    if (t.dataset.kscen) {
      const sc = K().scen.find((x) => x.id === t.dataset.kscen); if (!sc) return;
      ids(K()).forEach((x) => { s.st[x] = sc.lists.indexOf(x) >= 0 ? "in" : "out"; }); s.pm = sc.pm || null;
      persist(); api.rerender(); api.announce("נטען התרחיש: " + sc.t + ". " + live()); return;
    }
    const a = t.dataset.kact;
    if (a === "rescale") { if (rescale(K(), E(), s)) { persist(); api.rerender(); api.announce("המנדטים הותאמו ל-" + E().totalSeats + ". " + live()); } }
    else if (a === "back") { if (back(K(), E(), s, getCtx().now)) { persist(); api.rerender(); api.announce("המנדטים חזרו לחציון הסקרים. " + live()); } }
    else if (a === "clear") { clear(K(), s); persist(); api.rerender(); api.announce("התרחיש נוקה."); }
    else if (a === "copy") copyScenario();
  });
  root.addEventListener("change", (e) => {
    if (!mine()) return;
    const t = e.target as HTMLInputElement & HTMLSelectElement, s = S(), id = t.dataset.kid as string;
    if (t.dataset.kst) {
      const st = t.dataset.kst as Status;
      s.st[id] = st; if (s.pm && s.st[s.pm] !== "in") s.pm = null; persist(); api.rerender();
      const cf = conflicts(K(), s);
      api.announce(sn(id) + ": " + STN[st] + ". " + live() + (st === "in" ? " התנגשויות בצירוף: " + (cf.hard.length + cf.cond.length) + "." : ""));
      return;
    }
    if (t.dataset.kseat) {
      const r = setSeat(E(), s, t.dataset.kseat, t.value);
      if (!r.ok) { const er = root.querySelector("#ke-" + t.dataset.kseat); if (er) er.textContent = r.msg; t.value = String(s.seats[t.dataset.kseat]); t.setAttribute("aria-invalid", "true"); return; }
      persist(); api.rerender(); api.announce(live()); return;
    }
    if (t.dataset.kpm) { s.pm = t.value || null; persist(); api.rerender(); return; }
    if (t.dataset.ksel) { s.sel = t.value; persist(); api.rerender(); return; }
  });
  root.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (mine() && e.key === "Enter" && t.dataset && t.dataset.kseat) t.blur();
  });
}

export const coalitionModule: ViewModule = { views: { coalition: (ctx) => coalition(ctx, stateOf(ctx)) }, bind };
