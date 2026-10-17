/* Quiz views, ported from v5: home, quiz steps, results and the copy summary text.
   Pure: each takes the context (and reads the quiz state for its election), returns HTML. */
import type { Ctx, Question, QuizData } from "../types";
import { esc, fill, electionVars } from "../lib/html";
import { getState, type Basis, type QuizState } from "./state";
import { countValues, fmt, issueUrl, noneLabel, score, url, userLabel, valLabel } from "./score";
import { inBan } from "../time";
import { pageVars } from "../views/shell";

export interface ReflectItem { id: string; t: string; q: string }
interface HomeContent { intro: string; shortDuration: string; longDuration: string; beforeStart: string }
interface ResultsContent { economy: { lead: string; links: { url: string; text: string; after: string }[] } }

export function reflectItems(ctx: Ctx): ReflectItem[] { return (ctx.site.content.reflect as { items: ReflectItem[] }).items; }
export function stateOf(ctx: Ctx): QuizState { return getState(ctx.site.election.id); }
export function qlist(D: QuizData, S: QuizState): Question[] {
  return S.mode === "short" ? D.short.map((id) => D.questions.find((q) => q.id === id) as Question) : D.questions;
}
/** Placeholder values for content texts: election values plus counts computed from the data. */
export function quizVars(ctx: Ctx): Record<string, string | number> {
  const D = ctx.site.quiz;
  return { ...electionVars(ctx.site.election), lists: D.parties.length, statements: D.questions.length, shortStatements: D.short.length, values: countValues(D), reflectTopics: reflectItems(ctx).length };
}
const modeName = (S: QuizState) => (S.mode === "long" ? "מסלול מלא" : "מסלול מהיר");

export function home(ctx: Ctx): string {
  const S = stateOf(ctx), D = ctx.site.quiz, H = ctx.site.content.home as HomeContent, vars = quizVars(ctx);
  const has = Object.keys(S.ans).length > 0;
  let resume = "";
  if (has && S.done) resume = '<div class="note row" style="justify-content:space-between"><span><b>יש לך תוצאות שמורות</b> מהשאלון ה' + (S.mode === "long" ? "מלא" : "מהיר") + '.</span><button type="button" class="btn quiet" data-act="results">לתוצאות</button></div>';
  else if (has) resume = '<div class="note row" style="justify-content:space-between"><span><b>התחלת שאלון</b> ועצרת באמצע.</span><button type="button" class="btn quiet" data-act="resume">להמשיך מאיפה שעצרת</button></div>';
  return '<section class="hero" aria-labelledby="h-home">' +
    '<span class="eyebrow">כלי עזר להחלטה · הנתונים נכונים ל-' + D.asof + '</span>' +
    '<h1 id="h-home">לאיזו רשימה העמדות שלך באמת קרובות?</h1>' +
    '<p class="muted">' + fill(H.intro, vars) + '</p>' +
    '<div class="facts"><span><b>' + D.parties.length + '</b> רשימות</span><span><b>' + D.questions.length + '</b> היגדים</span><span><b>' + countValues(D) + '</b> ערכי עמדה מתועדים</span></div>' +
  '</section>' + resume +
  '<div class="choices" style="margin-top:16px">' +
    '<div class="slip"><span class="eyebrow">מסלול מהיר</span><span class="big">' + fill(H.shortDuration, vars) + '</span>' +
      '<div class="meta"><span>' + D.short.length + ' היגדים</span><span>·</span><span>בעד, באמצע או נגד</span></div>' +
      '<ul><li>לחיצה אחת לכל היגד</li><li>בסוף בוחרים שני נושאים שחשובים לך במיוחד</li></ul>' +
      '<button type="button" class="btn go" data-act="start-short">להתחיל במסלול המהיר</button></div>' +
    '<div class="slip"><span class="eyebrow">מסלול מלא</span><span class="big">' + fill(H.longDuration, vars) + '</span>' +
      '<div class="meta"><span>' + D.questions.length + ' היגדים</span><span>·</span><span>' + reflectItems(ctx).length + ' נושאים לבדיקה עצמית</span></div>' +
      '<ul><li>סולם של 5 דרגות, משקל לכל היגד וקווים אדומים</li><li>שתי הגישות המרכזיות בכל נושא</li><li>אפשר להשוות לפי מה שהמפלגות אמרו, לפי מה שעשו, או לפי שניהם</li></ul>' +
      '<button type="button" class="btn go" data-act="start-long">להתחיל במסלול המלא</button></div>' +
  '</div>' +
  '<div class="note" style="margin-top:20px"><b>לפני שמתחילים:</b> ' + fill(H.beforeStart, vars) + '</div>';
}

export function quiz(ctx: Ctx): string {
  const S = stateOf(ctx), qs = qlist(ctx.site.quiz, S), extra = S.mode === "long" ? 2 : 1, total = qs.length + extra;
  const prog = '<div class="progress" aria-hidden="true">' + Array.from({ length: total }, (_, i) => '<span class="' + (i < S.step ? "done" : i === S.step ? "now" : "") + '"></span>').join("") + '</div>';
  const label = '<div class="navrow" style="margin-bottom:8px"><span class="small muted">' + modeName(S) + ' · שלב ' + (S.step + 1) + ' מתוך ' + total + '</span><button type="button" class="linkbtn" data-act="home">יציאה לעמוד הראשי</button></div>';
  if (S.step < qs.length) return prog + label + (S.mode === "long" ? longQ(ctx, S, qs[S.step]) : shortQ(ctx, S, qs[S.step]));
  if (S.mode === "short") return prog + label + topPick(ctx, S);
  if (S.step === qs.length) return prog + label + reflectStep(ctx, S);
  return prog + label + reviewStep(ctx, S);
}

export function shortQ(ctx: Ctx, S: QuizState, q: Question): string {
  const u = S.ans[q.id];
  const b = (v: number, t: string) => '<button type="button" data-ans="' + v + '" class="' + (u === v ? "sel" : "") + '" aria-pressed="' + (u === v) + '">' + t + '</button>';
  return '<section class="qcard" aria-labelledby="stmt"><span class="topic">' + esc(ctx.site.quiz.cats[q.cat].t) + '</span><p class="stmt" id="stmt" tabindex="-1">' + esc(q.stmt) + '</p>' +
    '<div class="qbtns" role="group" aria-label="העמדה שלי">' + b(1.5, "בעד") + b(0, "באמצע") + b(-1.5, "נגד") + '</div>' +
    '<div class="navrow"><button type="button" class="linkbtn" data-act="skipq">אין לי עמדה, לדלג</button>' + (S.step > 0 ? '<button type="button" class="linkbtn" data-act="back">חזרה להיגד הקודם</button>' : '') + '</div></section>';
}

export function longQ(ctx: Ctx, S: QuizState, q: Question): string {
  const u = S.ans[q.id], imp = S.imp[q.id] || 1, red = !!S.red[q.id], none = u === null, cat = ctx.site.quiz.cats[q.cat];
  const vals: [number, string][] = [[2, "מסכים מאוד"], [1, "מסכים"], [0, "באמצע"], [-1, "לא מסכים"], [-2, "לא מסכים בכלל"]];
  const srcLink = '<p class="small"><a href="' + issueUrl(ctx.site.election, q) + '" target="_blank" rel="noopener">הניסוח המקורי, הסולם ועמדות כל הרשימות במאגר</a></p>';
  const details = '<details class="ctx"><summary>' + (cat.b ? "שתי הגישות המרכזיות בנושא" : "על השאלות בנושא הזה") + '</summary>' +
    (cat.b ? '<div class="args"><div><b>גישה אחת</b>' + esc(cat.a) + '</div><div><b>גישה אחרת</b>' + esc(cat.b) + '</div></div>' : '<p class="small muted" style="margin-top:8px">' + esc(cat.a) + '</p>') +
    '<p class="small muted" style="margin-top:8px">הגישות מנוסחות כאן כדי לעזור בחשיבה. הן לא מייצגות מפלגה מסוימת.</p>' + srcLink + '</details>';
  return '<section class="qcard" aria-labelledby="stmt"><span class="topic">' + esc(cat.t) + '</span><p class="stmt" id="stmt" tabindex="-1">' + esc(q.stmt) + '</p>' + details +
    '<div class="subq"><span class="lbl" id="lp">העמדה שלי</span><div class="scale" role="group" aria-labelledby="lp">' +
      vals.map((x) => '<button type="button" data-ans="' + x[0] + '" class="' + (u === x[0] ? "sel" : "") + '" aria-pressed="' + (u === x[0]) + '">' + x[1] + '</button>').join("") + '</div>' +
      '<div class="chips"><button type="button" data-ans="none" class="' + (none ? "sel" : "") + '" aria-pressed="' + none + '">אין לי עמדה מגובשת</button></div></div>' +
    '<div class="subq"><span class="lbl" id="li">כמה ההיגד חשוב לי</span><div class="chips acc" role="group" aria-labelledby="li">' +
      ([[1, "רגיל"], [2, "חשוב"], [3, "חשוב מאוד"]] as [number, string][]).map((x) => '<button type="button" data-imp="' + x[0] + '" class="' + (imp === x[0] ? "sel" : "") + '" aria-pressed="' + (imp === x[0]) + '">' + x[1] + '</button>').join("") + '</div></div>' +
    '<label class="redline" for="red-' + q.id + '"><input type="checkbox" id="red-' + q.id + '" data-red="1"' + (red ? " checked" : "") + '><span><b>קו אדום.</b> רשימה שעמדתה רחוקה מעמדתי ב-2.5 דרגות או יותר תסומן בתוצאות ותרד לתחתית הדירוג.</span></label>' +
    '<div class="navrow">' + (S.step > 0 ? '<button type="button" class="btn ghost" data-act="back">חזרה</button>' : '<span></span>') + '<button type="button" class="btn" data-act="next"' + (u === undefined ? ' disabled aria-describedby="need"' : '') + '>להיגד הבא</button></div>' +
    (u === undefined ? '<span class="small muted" id="need">צריך לבחור עמדה, או "אין לי עמדה מגובשת", כדי להמשיך.</span>' : '') + '</section>';
}

export function topPick(ctx: Ctx, S: QuizState): string {
  const D = ctx.site.quiz;
  const opts = D.short.filter((id) => S.ans[id] !== undefined && S.ans[id] !== null);
  return '<section class="qcard" aria-labelledby="stmt"><span class="topic">צעד אחרון</span><p class="stmt" id="stmt" tabindex="-1">אילו שני היגדים חשובים לך במיוחד?</p><p class="small muted">ההיגדים שייבחרו כאן יקבלו משקל כפול בחישוב. אפשר גם לדלג.</p>' +
    '<div class="chips acc" role="group" aria-label="היגדים חשובים">' + opts.map((id) => { const on = S.top.indexOf(id) >= 0; return '<button type="button" data-top="' + id + '" class="' + (on ? "sel" : "") + '" aria-pressed="' + on + '">' + esc((D.questions.find((q) => q.id === id) as Question).label) + '</button>'; }).join("") + '</div>' +
    '<div class="navrow"><button type="button" class="btn ghost" data-act="back">חזרה</button><button type="button" class="btn" data-act="finish">לתוצאות</button></div></section>';
}

export function reflectStep(ctx: Ctx, S: QuizState): string {
  return '<section class="qcard" aria-labelledby="stmt"><span class="topic">נושאים לבדיקה עצמית</span><p class="stmt" id="stmt" tabindex="-1">נושאים שאין עליהם השוואה שיטתית</p>' +
    '<p class="small muted">לא מצאתי מקור שמשווה בנושאים האלה את עמדות כל הרשימות לפי אותה שיטה, ולכן הם לא נכנסים לחישוב. אפשר לסמן כמה כל נושא חשוב לך, והנושאים שיסומנו יופיעו בתוצאות כרשימה לבדיקה במצעים.</p>' +
    reflectItems(ctx).map((r) => {
      const st = S.refl[r.id] || {};
      return '<div class="subq" style="border-top:1px solid var(--line);padding-top:12px"><span class="lbl" id="rl-' + r.id + '">' + esc(r.t) + '</span><span class="small muted">' + esc(r.q) + '</span>' +
        '<div class="chips acc" role="group" aria-labelledby="rl-' + r.id + '">' + ([[0, "פחות רלוונטי לי"], [2, "חשוב"], [3, "חשוב מאוד"]] as [number, string][]).map((x) => '<button type="button" data-refl="' + r.id + '" data-rv="' + x[0] + '" class="' + (st.i === x[0] ? "sel" : "") + '" aria-pressed="' + (st.i === x[0]) + '">' + x[1] + '</button>').join("") + '</div>' +
        '<label class="small muted" for="rn-' + r.id + '">הערה לעצמי (לא חובה)</label><textarea id="rn-' + r.id + '" data-rnote="' + r.id + '" rows="2">' + esc(st.note || "") + '</textarea></div>';
    }).join("") +
    '<div class="navrow"><button type="button" class="btn ghost" data-act="back">חזרה</button><button type="button" class="btn" data-act="next">לסיכום התשובות</button></div></section>';
}

export function reviewStep(ctx: Ctx, S: QuizState): string {
  const rows = ctx.site.quiz.questions.map((q) => {
    const u = S.ans[q.id];
    return '<div class="irow"><span class="it">' + esc(q.label) + '</span><span class="small">' + (u === null || u === undefined ? "אין עמדה" : userLabel(u)) + (S.imp[q.id] === 3 ? " · חשוב מאוד" : S.imp[q.id] === 2 ? " · חשוב" : "") + (S.red[q.id] ? " · קו אדום" : "") + '</span></div>';
  }).join("");
  return '<section class="qcard" aria-labelledby="stmt"><span class="topic">סיכום</span><p class="stmt" id="stmt" tabindex="-1">התשובות שלך</p><div>' + rows + '</div>' +
    '<div class="navrow"><button type="button" class="btn ghost" data-act="back">חזרה לתיקון</button><button type="button" class="btn" data-act="finish">לתוצאות</button></div></section>';
}

export function basisSeg(S: QuizState): string {
  const opts: [Basis, string][] = [["both", "שילוב"], ["said", "מה שאמרו"], ["did", "מה שעשו"]];
  return '<div class="seg" role="group" aria-label="לפי מה להשוות">' + opts.map((o) => '<button type="button" data-basis="' + o[0] + '" aria-pressed="' + (S.basis === o[0]) + '">' + o[1] + '</button>').join("") + '</div>';
}
export const BASIS_TXT: Record<Basis, string> = { both: "ממוצע של מה שהרשימה אמרה ומה שעשתה. כשיש רק אחד מהם, הוא משמש לבד.", said: "רק לפי הצהרות, ראיונות ומצעים.", did: "רק לפי הצבעות, חקיקה והחלטות. ברשימות חדשות ובנושאים שלא עמדו למבחן יהיה פחות מידע." };

export function sideHTML(D: QuizData, lab: string, v: number | null | undefined, low: unknown, x: string | undefined, u: string, d: string | undefined, imp: unknown): string {
  if (v === null || v === undefined) return '<span>' + lab + ': ' + noneLabel(x) + '</span>';
  return '<span>' + lab + ': <a href="' + esc(url(D, u)) + '" target="_blank" rel="noopener">' + valLabel(v) + ' (' + fmt(v) + ')</a>' + (d ? ', נכון ל-' + esc(d) : '') + (imp ? ', משתמע' : '') + (low ? ', ביטחון נמוך' : '') + '</span>';
}

export function results(ctx: Ctx): string {
  const S = stateOf(ctx), D = ctx.site.quiz, src = ctx.site.election.source, R = ctx.site.content.results as ResultsContent;
  if (!Object.keys(S.ans).some((k) => S.ans[k] !== null)) {
    return '<div class="stack"><h2>עדיין אין תוצאות</h2><p class="muted">צריך לענות לפחות על היגד אחד.</p><div class="row"><button type="button" class="btn" data-act="start-short">מסלול מהיר</button><button type="button" class="btn ghost" data-act="start-long">מסלול מלא</button></div></div>';
  }
  const res = score(D, S, S.basis), alt: Record<string, number | null> = {};
  (["said", "did"] as Basis[]).forEach((b) => { score(D, S, b).forEach((r) => { alt[b + r.p.id] = r.pct; }); });
  // during the poll ban, threshold tags from earlier polls carry the notice the law requires (same texts as the parties tab)
  const P = ctx.site.content.pages.parties, ban = inBan(ctx.now, ctx.site.election), stale = ban ? P.seatsBanSuffix : "";
  let pollTags = false;
  const list = res.map((r, i) => {
    const tags: string[] = [];
    if (r.reds.length) tags.push('<span class="tag red">חוצה קו אדום: ' + r.reds.map((x) => esc(x.label)).join(", ") + '</span>');
    if (r.thin) tags.push('<span class="tag warn">אין מספיק מידע על הרשימה</span>');
    tags.push('<span class="tag">מידע על ' + r.covered + ' מתוך ' + r.answered + ' היגדים</span>');
    const sa = alt["said" + r.p.id], da = alt["did" + r.p.id];
    if (S.basis === "both" && sa !== null && da !== null && Math.abs(sa - da) >= 10) tags.push('<span class="tag warn">לפי מה שאמרו ' + sa + '%, לפי מה שעשו ' + da + '%</span>');
    if (r.p.th === "below") tags.push('<span class="tag warn">בסקרים מתחת לאחוז החסימה' + stale + '</span>');
    if (r.p.th === "near") tags.push('<span class="tag warn">בסקרים סביב אחוז החסימה' + stale + '</span>');
    if (r.p.th === "below" || r.p.th === "near") pollTags = true;
    const pctTxt = r.pct === null ? '<span class="muted" style="font-size:1rem">אין</span>' : r.pct + '<small>%</small>';
    const detail = r.rows.map((x) => {
      let verdict: string, cls: string;
      if (!x.pv) { verdict = "אין מידע"; cls = "na"; }
      else if ((x.a as number) >= 0.75) { verdict = "קרוב"; cls = "ok"; }
      else if ((x.a as number) >= 0.45) { verdict = "קרוב חלקית"; cls = "part"; }
      else { verdict = "רחוק"; cls = "no"; }
      const c = x.c;
      const exp = '<span>העמדה שלך: ' + userLabel(x.u) + '</span> · ' +
        sideHTML(D, "אמרו", c.s, c.sl, c.sx, c.su, c.sd, c.si) + ' · ' + sideHTML(D, "עשו", c.a, c.al, c.ax, c.au, c.ad, c.ai) +
        (c.g ? ' · <b>המאגר מסמן פער בין ההצהרה למעשים</b>' : '');
      return '<div class="irow"><span class="it">' + esc(x.q.label) + '</span><span class="verdict ' + cls + '">' + verdict + '</span><span class="exp">' + exp + '</span></div>';
    }).join("");
    return '<div class="party"><button type="button" aria-expanded="false" aria-controls="d-' + r.p.id + '" data-toggle="' + r.p.id + '">' +
      '<span class="rank">' + (i + 1) + '</span><span><span class="pname">' + esc(r.p.n) + '</span><span class="letters" title="האותיות בפתק ההצבעה">' + esc(r.p.letters) + '</span><br><span class="plead">' + esc(r.p.l) + '</span></span>' +
      '<span class="pct">' + pctTxt + '</span>' +
      '<span class="bar" aria-hidden="true"><i style="width:' + (r.pct || 0) + '%"></i></span>' +
      '<span class="tags">' + tags.join("") + '</span></button>' +
      '<div class="pdetail" id="d-' + r.p.id + '" hidden>' + detail +
      '<p class="small" style="padding-top:10px"><a href="' + esc(D.base + r.p.id + '.html') + '" target="_blank" rel="noopener">כל הראיות על ' + esc(r.p.n) + ' במאגר "' + esc(src.nameHe) + '"</a></p></div></div>';
  }).join("");

  let refl = "";
  if (S.mode === "long") {
    const imp = reflectItems(ctx).filter((r) => S.refl[r.id] && (S.refl[r.id].i as number) >= 2);
    if (imp.length) refl = '<section class="stack" style="margin-top:28px" aria-labelledby="h-refl"><h2 id="h-refl">לבדוק בעצמך במצעים</h2><p class="muted small">אלה הנושאים שסומנו כחשובים ואין עליהם השוואה שיטתית. כדאי לקרוא מה כתוב עליהם במצעים של שתיים או שלוש הרשימות הקרובות אליך.</p><div>' +
      imp.map((r) => { const st = S.refl[r.id]; return '<div class="irow"><span class="it">' + esc(r.t) + '</span><span class="small">' + (st.i === 3 ? "חשוב מאוד" : "חשוב") + '</span>' + (st.note ? '<span class="exp">' + esc(st.note) + '</span>' : '') + '</div>'; }).join("") +
      '</div><ul class="check small"><li>הקישורים למצעים של כל רשימה נמצאים בלשונית <button type="button" class="linkbtn" data-act="go-parties" style="min-height:0;padding:0">הרשימות</button>.</li><li>' + esc(R.economy.lead) +
      R.economy.links.map((l) => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.text) + '</a>' + esc(l.after)).join("") + '</li></ul></section>';
  }

  return '<section class="stack" aria-labelledby="h-res">' +
    '<span class="eyebrow">התוצאות שלך · ' + modeName(S) + '</span>' +
    '<h2 id="h-res">עד כמה כל רשימה קרובה לעמדות שלך</h2>' +
    (ban && pollTags ? '<div class="banner" role="note">' + fill(P.banNotice, pageVars(ctx)) + '</div>' : '') +
    '<div class="row">' + basisSeg(S) + '</div><p class="small muted" id="basis-txt">' + BASIS_TXT[S.basis] + '</p>' +
    '<p class="muted small">הקרבה בכל היגד היא 1 פחות המרחק בין העמדות חלקי 4. התוצאה היא ממוצע משוקלל לפי החשיבות שנתת. ערך שנשען רק על ראיה חלשה מקבל חצי משקל, והיגדים בלי מידע על הרשימה לא נספרים לה. לחיצה על רשימה פותחת את הפירוט ואת הקישורים לראיות.</p>' +
    '<div class="legend"><span>קרוב: הבדל של עד דרגה אחת</span><span>קרוב חלקית: בערך שתי דרגות</span><span>רחוק: יותר מזה</span></div>' +
    '<div class="res">' + list + '</div>' +
    '<div class="row" style="margin-top:8px"><button type="button" class="btn" data-act="copy">העתקת סיכום</button><button type="button" class="btn ghost" data-act="start-long">' + (S.mode === "long" ? "לענות מחדש" : "למסלול המלא") + '</button><button type="button" class="btn ghost" data-act="go-decide">איך ממשיכים מכאן</button></div>' +
    '<div class="note"><b>זו לא המלצה.</b> הכלי משווה עמדות בהיגדים נבחרים בלבד. הוא לא שוקל את ראש הרשימה, את האנשים ברשימה, את הסיכוי לעבור את אחוז החסימה או את הקואליציה שהרשימה צפויה לתמוך בה.</div>' +
    '</section>' + refl;
}

/** Text of the copy-summary action (v5 copySummary without the clipboard part). */
export function summaryText(ctx: Ctx): string {
  const S = stateOf(ctx), D = ctx.site.quiz;
  const res = score(D, S, S.basis).filter((r) => r.pct !== null).slice(0, 5);
  const lines = ["התוצאות שלי בכלי \"לפני הקלפי\" (" + modeName(S) + ", השוואה לפי " + ({ both: "שילוב של מה שאמרו ומה שעשו", said: "מה שאמרו", did: "מה שעשו" } as Record<Basis, string>)[S.basis] + "):"];
  res.forEach((r, i) => { lines.push((i + 1) + ". " + r.p.n + ": " + r.pct + "%" + (r.reds.length ? " (חוצה קו אדום)" : "")); });
  lines.push("זו השוואת עמדות בהיגדים נבחרים, לא המלצת הצבעה. העמדות לפי המאגר \"" + ctx.site.election.source.nameHe + "\", נכון ל-" + D.asof + ".");
  return lines.join("\n");
}
