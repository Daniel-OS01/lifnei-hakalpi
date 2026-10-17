/* App shell: loads the election's site.json, renders header, countdown, banner and footer, and routes between views (v5 show/rerender). */
import "@fontsource/secular-one/400.css";
import "@fontsource/ibm-plex-sans-hebrew/400.css";
import "@fontsource/ibm-plex-sans-hebrew/500.css";
import "@fontsource/ibm-plex-sans-hebrew/600.css";
import "@fontsource/ibm-plex-sans-hebrew/700.css";
import "./styles.css";
import config from "../config/site.json";
import type { Api, Ctx, SiteData } from "./types";
import { esc, fill } from "./lib/html";
import { daysToElection, afterElection } from "./time";
import { modules } from "./modules";
import { getState } from "./quiz";
import { pageVars } from "./views/shell";

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const view = $("view");

function pickElection(): string {
  const e = new URLSearchParams(location.search).get("e");
  return e && config.elections.includes(e) ? e : config.currentElection;
}

function chrome(ctx: Ctx): void {
  const P = ctx.site.content.pages, V = pageVars(ctx), e = ctx.site.election;
  document.title = "לפני הקלפי " + e.dateIso.slice(0, 4);
  $("eyebrow").textContent = fill(P.header.eyebrow, V);
  const days = daysToElection(ctx.now, e), cd = $("countdown");
  if (days > 1) cd.innerHTML = fill(P.countdown.days, { ...V, days });
  else if (days === 1) cd.innerHTML = fill(P.countdown.tomorrow, V);
  else if (days === 0) cd.innerHTML = fill(P.countdown.today, V);
  else cd.textContent = fill(P.countdown.after, V);
  $("banner").innerHTML = afterElection(ctx.now, e) ? '<div class="banner" role="note">' + fill(P.afterBanner, V) + "</div>" : "";
  const ids = ctx.electionIds, cur = e.id;
  const archive = ids.length > 1
    ? '<nav class="small" aria-label="ארכיון בחירות"><span>ארכיון: </span>' + ids.map((id) => id === cur ? "<b>" + esc(id) + "</b>" : '<a href="?e=' + encodeURIComponent(id) + '">' + esc(id) + "</a>").join(" · ") + "</nav>"
    : "";
  $("footer").innerHTML = (P.footer as string[]).map((t) => "<span>" + fill(t, V) + "</span>").join("") + archive;
}

function start(site: SiteData): void {
  const ctx = (): Ctx => ({ site, now: Date.now(), electionIds: config.elections, siteVersion: config.siteVersion });
  const views: Record<string, (c: Ctx) => string> = {};
  modules.forEach((m) => Object.assign(views, m.views));
  let current = "home";
  const quizDone = (): boolean => getState(site.election.id).done;

  function show(name: string, keepScroll?: boolean): void {
    current = name;
    const c = ctx();
    chrome(c);
    view.innerHTML = views[name](c);
    document.querySelectorAll<HTMLButtonElement>("nav.tabs button").forEach((b) => {
      const on = b.dataset.view === name || (b.dataset.view === "home" && (name === "quiz" || name === "results"));
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    try { history.replaceState(null, "", location.search + "#" + (name === "quiz" ? "home" : name)); } catch { /* v5: ignore */ }
    if (!keepScroll) {
      window.scrollTo(0, 0);
      const f = view.querySelector<HTMLElement>("#stmt") || view.querySelector<HTMLElement>("h1, h2");
      if (f) { if (!f.hasAttribute("tabindex")) f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); }
    }
  }
  function rerender(): void {
    const y = window.scrollY, a = document.activeElement as HTMLElement | null;
    const sel = a && a.dataset ? Object.keys(a.dataset).map((k) => "[data-" + k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()) + '="' + a.dataset[k] + '"]').join("") : "";
    show(current, true); window.scrollTo(0, y);
    if (sel) { const n = view.querySelector<HTMLElement>(sel); if (n) n.focus({ preventScroll: true }); }
  }
  function announce(t: string): void { const l = $("live"); l.textContent = ""; setTimeout(() => { l.textContent = t; }, 50); }
  function toast(msg: string): void {
    const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => { t.remove(); }, 2400);
  }
  const api: Api = { show, rerender, announce, toast, current: () => current };

  document.querySelector("nav.tabs")!.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-view]"); if (!b) return;
    if (b.dataset.view === "home" && quizDone()) { show("results"); return; }
    show(b.dataset.view!);
  });
  /* Generic handlers from v5: data-act="go-<view>" navigation and data-toggle disclosure. */
  view.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLButtonElement>("button"); if (!t) return;
    const act = t.dataset.act;
    if (act && act.startsWith("go-") && views[act.slice(3)]) { show(act.slice(3)); return; }
    if (t.dataset.toggle) { const d = document.getElementById("d-" + t.dataset.toggle); if (d) { d.hidden = !d.hidden; t.setAttribute("aria-expanded", String(!d.hidden)); } }
  });
  modules.forEach((m) => m.bind?.(view, ctx, api));

  const h = (location.hash || "").replace("#", "");
  /* v5 start rule: never open mid-quiz; results only when the quiz is done; with no hash, results when done. */
  show(views[h] && h !== "quiz" ? (h === "results" && !quizDone() ? "home" : h) : (quizDone() ? "results" : "home"));
}

const id = pickElection();
fetch(import.meta.env.BASE_URL + "data/elections/" + id + "/site.json")
  .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<SiteData>; })
  .then(start)
  .catch(() => {
    document.title = "לפני הקלפי";
    view.innerHTML = '<div class="banner" role="alert"><b>לא הצלחנו לטעון את נתוני האתר.</b> כדאי לרענן את העמוד או לנסות שוב מאוחר יותר.</div>';
  });
