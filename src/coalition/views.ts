/* Coalition tab views, ported from v5 coal.js. Pure: each takes the context (and the coalition state)
   and returns HTML. Election numbers come from election.json, texts that carry them from content. */
import type { CoalData, CoalList, Ctx, Election, Level, Scenario, Src, Stage, Statement } from "../types";
import { esc, dmy, dm, fill, electionVars } from "../lib/html";
import { inBan } from "../time";
import { LVN, STN, cellOf, conflicts, ids, listOf, sums, type CoalState, type Conflict, type Conflicts, type Status } from "./logic";

export interface CoalContent {
  intro: string; banNotice: string; pollsNote: string; matrixIntro: string; outAbout: string; supNote: string;
  govLabel: string; sourcesNote: string; vars: Record<string, string>;
}
export interface FormationContent {
  law: Record<string, string>; surplusIntro: string; stepsTitle: string; steps: { title: string; html: string }[];
  checked: string; checkedNote: string; glossary: { term: string; html: string }[];
}
type Sums = ReturnType<typeof sums>;
interface StmtLike {
  lv: Level; t: string; d?: string; cond?: string | null; s: Src[]; st?: Stage[]; rep?: boolean; gen?: boolean;
  db?: Statement["db"];
}

const coalContent = (ctx: Ctx) => ctx.site.content.coalition as CoalContent;
const formationContent = (ctx: Ctx) => ctx.site.content.formation as FormationContent;
const nm = (K: CoalData, id: string) => esc(listOf(K, id).sn);

/** Placeholder values for the coalition and formation texts: election values plus values from the data. */
export function coalVars(ctx: Ctx): Record<string, string | number> {
  const K = ctx.site.coalition, E = ctx.site.election, C = coalContent(ctx), F = formationContent(ctx);
  const eve = new Date(E.pollBan.from.slice(0, 10) + "T00:00:00Z"); eve.setUTCDate(eve.getUTCDate() - 1);
  return {
    ...electionVars(E), ...C.vars,
    sourceName: esc(E.source.nameHe),
    banEve: dmy(eve.toISOString()),
    pollsFrom: dm(K.lists.reduce((m, p) => (p.pf < m ? p.pf : m), K.lists[0].pf)),
    pollsTo: dmy(K.lists.reduce((m, p) => (p.pt > m ? p.pt : m), K.lists[0].pt)),
    pollsLink: '<a href="' + esc(K.polls) + '" target="_blank" rel="noopener">טבלת הסקרים</a>',
    srcBuilt: K.srcBuilt, srcShaShort: K.srcSha.slice(0, 16),
    thresholdSeats: Math.round(E.thresholdPct * E.totalSeats) / 100, belowMinSeats: E.minSeatsIfPassed - 1,
    checked: dmy(F.checked),
  };
}
/** [[lawKey|text]] -> link to the law text in data/common/formation.json */
export function lawLinks(F: FormationContent, html: string): string {
  return html.replace(/\[\[(\w+)\|([^\]]+)\]\]/g, (_m, k: string, t: string) => '<a href="' + esc(F.law[k]) + '" target="_blank" rel="noopener">' + t + '</a>');
}

export function srcLinks(arr: Src[]): string {
  return arr.map((x) => {
    const a: string[] = [];
    if (x.u) a.push('<a href="' + esc(x.u) + '" target="_blank" rel="noopener">' + esc(x.o || "מקור") + '</a>');
    if (x.e) a.push('<a href="' + esc(x.e) + '" target="_blank" rel="noopener">' + (x.u ? "הראיה במאגר" : esc(x.o || "המאגר")) + '</a>');
    if (x.x) a.push('<span class="tag">לא מהמאגר</span>');
    return a.join(" · ");
  }).join(" · ");
}
const lvChip = (lv: Level) => '<span class="lv lv-' + lv + '">' + LVN[lv] + '</span>';
function stagesHTML(st: Stage[] | undefined): string {
  if (!st || !st.length) return "";
  return '<div class="stages"><b>שלב קודם:</b> ' + st.map((x) => dmy(x.d) + ', ' + LVN[x.lv] + (x.cond ? ' (' + esc(x.cond) + ')' : '') + ': ' + esc(x.t) + ' ' + srcLinks(x.s)).join("<br>") + '<br><span class="muted">האמירה המאוחרת מכריעה.</span></div>';
}
const CONF: Record<string, string> = { h: "גבוה", m: "בינוני", l: "נמוך" };
export function stmtHTML(c: StmtLike, who?: string): string {
  const db = c.db;
  return '<div class="stmt-i">' + (who ? '<span class="who">' + who + '</span>' : '') + lvChip(c.lv) + (c.cond ? ' <span class="cond">התנאי: ' + esc(c.cond) + '</span>' : '') +
    '<p>' + esc(c.t) + '</p><p class="small muted">' + [c.d ? dmy(c.d) : '', c.rep ? 'לפי דיווח, לא ציטוט ישיר' : '', c.gen ? 'אמירה כללית' : '', db ? '<span dir="rtl">ערך במאגר: <span dir="ltr">' + ((db.v as number) > 0 ? "+" : "") + db.v + '</span>' + (db.c ? ", ביטחון " + CONF[db.c] : "") + (db.im ? ", משתמע" : "") + '</span>' : '', srcLinks(c.s)].filter(Boolean).join(' · ') + '</p>' + stagesHTML(c.st) + '</div>';
}
function conflictHTML(ctx: Ctx, x: Conflict): string {
  const K = ctx.site.coalition, C = coalContent(ctx);
  let head: string;
  if (x.k === "supnote") return '<li class="ci note-i">' + fill(C.supNote, { list: nm(K, x.b) }) + '</li>';
  if (x.k === "pair") head = nm(K, x.a) + ' על ' + nm(K, x.b);
  else if (x.k === "pm") head = nm(K, x.a) + ' על ממשלה בראשות ' + esc(listOf(K, x.b).lead);
  else head = nm(K, x.a) + ' על ' + C.outAbout + ' (כאן: ' + nm(K, x.b) + ')';
  return '<li class="ci">' + stmtHTML(x.c, head) + '</li>';
}

export function rowHTML(ctx: Ctx, s: CoalState, p: CoalList, cf: Conflicts): string {
  const id = p.id, st = s.st[id], v = s.seats[id];
  const mine = cf.hard.concat(cf.cond).filter((x) => x.a === id || x.b === id).length;
  const med = inBan(ctx.now, ctx.site.election) ? '' : '<span class="small muted">חציון ' + p.med + ' (טווח ' + p.lo + ' עד ' + p.hi + ')</span>';
  return '<div class="krow st-' + st + '" id="kr-' + id + '">' +
    '<div class="kname"><span class="letters" title="האותיות בפתק">' + esc(p.l) + '</span> <b>' + esc(p.sn) + '</b> <span class="plead">' + esc(p.lead) + '</span>' +
      (p.cp.length > 1 ? '<span class="small muted kcp">' + p.cp.map(esc).join(" + ") + '</span>' : '') +
      (mine && st === "in" ? ' <a class="tag red" href="#k-conf">התנגשויות: ' + mine + '</a>' : '') + '</div>' +
    '<div class="kseats"><button type="button" class="kb" data-kstep="-1" data-kid="' + id + '" aria-label="הורדת מנדט מ' + esc(p.sn) + '">−</button>' +
      '<label class="sr" for="ks-' + id + '">מנדטים ל' + esc(p.sn) + '</label><input id="ks-' + id + '" class="kin" type="text" inputmode="numeric" autocomplete="off" value="' + v + '" data-kseat="' + id + '">' +
      '<button type="button" class="kb" data-kstep="1" data-kid="' + id + '" aria-label="הוספת מנדט ל' + esc(p.sn) + '">+</button>' + med + '</div>' +
    '<fieldset class="kst"><legend class="sr">מעמד ' + esc(p.sn) + ' בתרחיש</legend>' +
      (["in", "out", "sup"] as Status[]).map((k) => '<label class="' + (st === k ? "on" : "") + '"><input type="radio" name="kst-' + id + '" value="' + k + '" data-kst="' + k + '" data-kid="' + id + '"' + (st === k ? " checked" : "") + '>' + STN[k] + '</label>').join("") + '</fieldset>' +
    '<p class="kerr small" id="ke-' + id + '" role="alert"></p></div>';
}

export function sumWarnHTML(E: Election, sm: Sums): string {
  const T = E.totalSeats;
  if (sm.total === 0) return '<p class="note">עדיין לא הוזנו מנדטים. אפשר להקליד מספר ליד כל רשימה או להשתמש בכפתורי הפלוס והמינוס.</p>';
  return sm.total === T ? '' :
    '<div class="kwarn" role="alert"><b>סך כל המנדטים הוא ' + sm.total + ', לא ' + T + '.</b> בכנסת יש בדיוק ' + T + ' מושבים. אפשר לתקן ידנית, או להתאים את כל הרשימות לפי היחס ביניהן. רשימה עם מנדטים לא תרד מתחת ל-' + E.minSeatsIfPassed + '. <button type="button" class="btn quiet" data-kact="rescale"' + (sm.total ? '' : ' disabled') + '>התאם יחסית ל-' + T + '</button></div>';
}
export function counterBody(E: Election, sm: Sums): string {
  const T = E.totalSeats, M = E.majority;
  const scale = Math.max(T, sm.total), w = (n: number) => ((100 * n) / scale).toFixed(2) + "%";
  const rest = Math.max(0, sm.total - sm.coal - sm.sup);
  return '<div class="kcount" role="group" aria-label="מונה המנדטים"><div class="knums"><span><b>' + sm.coal + '</b> בקואליציה <span class="muted">מתוך ' + M + ' הדרושים</span></span>' +
    (sm.sup ? '<span><b>' + sm.sup + '</b> תמיכה מבחוץ</span>' : '') +
    '<span><b>' + sm.total + '</b> סך הכול <span class="muted">מתוך ' + T + '</span></span></div>' +
    '<div class="kbar" role="img" aria-label="' + sm.coal + ' בקואליציה, ' + sm.sup + ' בתמיכה מבחוץ, ' + rest + ' אחרים, מתוך ' + sm.total + '">' +
      '<i class="b-in" style="width:' + w(sm.coal) + '"></i><i class="b-sup" style="width:' + w(sm.sup) + '"></i><i class="b-rest" style="width:' + w(rest) + '"></i>' +
      '<span class="m61" style="inset-inline-start:' + w(M) + '" title="' + M + '"></span>' + (scale > T ? '<span class="m120" style="inset-inline-start:' + w(T) + '" title="' + T + '"></span>' : '') + '</div>' +
'</div>';
}
export function counterNote(E: Election, sm: Sums): string {
  const M = E.majority;
  return '<div class="legend"><span><i class="sw b-in"></i>בקואליציה</span><span><i class="sw b-sup"></i>תמיכה מבחוץ</span><span><i class="sw b-rest"></i>מחוץ לקואליציה</span><span>הקו: ' + M + ', רוב מכלל חברי הכנסת</span></div>' +
    (sm.coal >= M ? '<p class="small">לקואליציה בתרחיש יש רוב של ' + sm.coal + ' מתוך ' + E.totalSeats + '.</p>' : (sm.coal ? '<p class="small">חסרים ' + (M - sm.coal) + ' מנדטים לרוב של ' + M + '. ממשלה בלי ' + M + ' יכולה לקום רק אם חלק מהאחרים יתמכו מבחוץ או יימנעו בהצבעת האמון (ראו "ממשלת מיעוט" במילון).</p>' : ''));
}

export function conflictsHTML(ctx: Ctx, s: CoalState, cf: Conflicts): string {
  const K = ctx.site.coalition;
  const n = cf.hard.length + cf.cond.length;
  const inn = ids(K).filter((id) => s.st[id] === "in");
  const pmSel = '<label class="kpm">ראש הממשלה בתרחיש: <select data-kpm="1"><option value="">לא נקבע</option>' + inn.map((id) => '<option value="' + id + '"' + (cf.pm === id ? " selected" : "") + '>' + esc(listOf(K, id).lead) + ' (' + esc(listOf(K, id).sn) + ')</option>').join("") + '</select></label>';
  const ci = (x: Conflict) => conflictHTML(ctx, x);
  let h = '<section id="k-conf" class="kconf" aria-labelledby="h-kc" tabindex="-1"><h3 id="h-kc">בדיקת התנגשויות</h3>' + (inn.length ? pmSel : '');
  if (!inn.length) return h + '<p class="muted small">סמנו רשימות "בקואליציה" כדי לבדוק אם הצירוף סותר הצהרות שלהן.</p></section>';
  if (n) h += '<p><b class="bad">' + n + ' הצהרות מתועדות סותרות את הצירוף.</b> "פוסלת במפורש" ו"פוסלת בתנאי" מוצגות בנפרד.</p>';
  else h += '<p>לא נמצאה בצירוף הזה הצהרה מתועדת שסותרת אותו.' + (cf.unknown.length ? ' זה לא אומר שאין התנגדות: על חלק מהזוגות אין מידע.' : '') + '</p>';
  if (cf.hard.length) h += '<h4>פוסלת במפורש</h4><ul class="clist hard">' + cf.hard.map(ci).join("") + '</ul>';
  if (cf.cond.length) h += '<h4>פוסלת בתנאי</h4><ul class="clist cond">' + cf.cond.map(ci).join("") + '</ul>';
  if (cf.pmMaybe.length) h += '<h4>תלוי בזהות ראש הממשלה</h4><p class="small muted">ההצהרות האלה עוסקות בראש הממשלה. בחרו ראש ממשלה למעלה כדי לראות אם הן חלות.</p><ul class="clist maybe">' + cf.pmMaybe.map(ci).join("") + '</ul>';
  const other = cf.info.filter((x) => x.k === "pair" && (x.c.lv === "P" || x.c.lv === "O"));
  const nn = cf.info.filter((x) => x.k !== "pair" || x.c.lv === "N");
  if (other.length || nn.length) h += '<details class="ctx"><summary>הצהרות נוספות בין הרשימות שבחרת (' + (other.length + nn.length) + ')</summary><ul class="clist">' + other.concat(nn).map(ci).join("") + '</ul></details>';
  if (cf.unknown.length) h += '<p class="small muted">' + cf.unknown.length + ' זוגות בצירוף בלי מידע מתועד ("לא ידוע"): ' + cf.unknown.map((x) => nm(K, x[0]) + ' על ' + nm(K, x[1])).join("; ") + '.</p>';
  return h + '</section>';
}

/** The sources under a ready scenario, chosen by its srcRule (v5 srcFor). */
export function scenSources(K: CoalData, sc: Scenario): string {
  const out: string[] = [], r = sc.srcRule;
  if (r && r.pmHead) K.pm.forEach((p) => { if (p.h === r.pmHead && p.lv === r.lv && sc.lists.indexOf(p.a) >= 0) out.push(nm(K, p.a) + ': ' + srcLinks(p.s)); });
  if (r && r.cell) { const c = cellOf(K, r.cell[0], r.cell[1]); if (c) out.push(nm(K, r.cell[0]) + ': ' + srcLinks(c.s)); }
  return out.join("<br>");
}
export function scenHTML(K: CoalData): string {
  return '<div class="kscen">' + K.scen.map((sc) =>
    '<div class="kscard"><button type="button" class="btn ghost" data-kscen="' + sc.id + '">' + esc(sc.t) + '</button><p class="small muted">' + esc(sc.why) + '</p><p class="small">' + scenSources(K, sc) + '</p></div>'
  ).join("") + '</div>';
}

export function matrixHTML(ctx: Ctx, s: CoalState): string {
  const K = ctx.site.coalition, C = coalContent(ctx), I = ids(K);
  const sel = s.sel, p = listOf(K, sel);
  const said = I.filter((b) => b !== sel).map((b) => ({ b, c: cellOf(K, sel, b) }));
  const about = I.filter((a) => a !== sel).map((a) => ({ a, c: cellOf(K, a, sel) }));
  const known = said.filter((x) => x.c), unk = said.filter((x) => !x.c);
  const kn2 = about.filter((x) => x.c), unk2 = about.filter((x) => !x.c);
  const pmS = K.pm.filter((x) => x.a === sel), pmA = K.pm.filter((x) => x.h === sel);
  const o = K.out[sel];
  const opts = K.lists.map((q) => '<option value="' + q.id + '"' + (q.id === sel ? " selected" : "") + '>' + esc(q.sn) + '</option>').join("");
  let h = '<label class="kpm">בחרו רשימה: <select data-ksel="1">' + opts + '</select></label>';
  h += '<div class="kmx"><div><h4>מה ' + esc(p.sn) + ' אמרה על רשימות אחרות</h4>' +
    (pmS.length ? pmS.map((c) => stmtHTML(c, 'על ממשלה בראשות ' + esc(listOf(K, c.h as string).lead))).join("") : '') +
    known.map((x) => stmtHTML(x.c as Statement, 'על ' + nm(K, x.b))).join("") +
    (o ? stmtHTML(o.lv ? { lv: o.lv, t: o.t, d: "", s: o.s, st: [] } : o, 'על ' + C.outAbout) : '') +
    (unk.length ? '<p class="small muted"><b>לא ידוע</b> (אין הצהרה מתועדת במאגר או במקור ראשוני שבדקתי): ' + unk.map((x) => nm(K, x.b)).join(", ") + '.</p>' : '') + '</div>' +
    '<div><h4>מה רשימות אחרות אמרו על ' + esc(p.sn) + '</h4>' +
    (pmA.length ? pmA.map((c) => stmtHTML(c, nm(K, c.a) + ' על ממשלה בראשות ' + esc(p.lead))).join("") : '') +
    kn2.map((x) => stmtHTML(x.c as Statement, nm(K, x.a))).join("") +
    (unk2.length ? '<p class="small muted"><b>לא ידוע:</b> ' + unk2.map((x) => nm(K, x.a)).join(", ") + '.</p>' : '') + '</div></div>';
  return h;
}
const SYM: Record<string, string> = { X: "✕", C: "<span dir=\"ltr\">✕?</span>", N: "·", O: "○", P: "●" };
export function gridHTML(K: CoalData): string {
  const head = '<tr><th class="pn" scope="col">מי אמרה \\ על מי</th>' + K.lists.map((q) => '<th scope="col" title="' + esc(q.sn) + '">' + esc(q.l) + '</th>').join("") + '</tr>';
  const rows = K.lists.map((a) =>
    '<tr><th class="pn" scope="row">' + esc(a.sn) + '</th>' + K.lists.map((b) => {
      if (a.id === b.id) return '<td class="self" aria-label="אותה רשימה">-</td>';
      const c = cellOf(K, a.id, b.id), lv: Level | "U" = c ? c.lv : "U";
      return '<td><span class="g g-' + lv + '" title="' + esc(a.sn) + ' על ' + esc(b.sn) + ': ' + LVN[lv] + '">' + (SYM[lv] || "?") + '</span><span class="sr">' + esc(a.sn) + ' על ' + esc(b.sn) + ': ' + LVN[lv] + '</span></td>';
    }).join("") + '</tr>'
  ).join("");
  return '<p class="small muted">שורה: הרשימה שאמרה. עמודה: הרשימה שעליה נאמר, לפי האותיות בפתק. <b>✕</b> פוסלת במפורש, <b>✕?</b> פוסלת בתנאי, <b>·</b> לא אמרה, <b>○</b> פתוחה, <b>●</b> הודיעה על שותפות או המלצה, <b>?</b> לא ידוע. ההצהרות על ראשות הממשלה מופיעות בבחירת רשימה, לא בטבלה.</p><div class="tablewrap"><table class="kgrid"><caption class="sr">מי אמר מה על מי</caption><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
}

const VALW: Record<string, string> = { "2": "בעד במידה רבה", "1": "בעד", "0": "באמצע", "-1": "נגד", "-2": "נגד במידה רבה" };
function valWord(v: number | null): string { return v === null ? "אין ערך" : VALW[String(Math.round(v))] + ' (' + (v > 0 ? "+" : "") + v + ')'; }
interface CqCell { s: number | null; a: number | null; su: string; au: string }

export function cardHTML(ctx: Ctx, p: CoalList): string {
  const K = ctx.site.coalition, E = ctx.site.election, C = coalContent(ctx);
  const id = p.id, cq = K.cq[id] as unknown as Record<string, CqCell>, prev = E.knessetNumber - 1;
  const sentence = 'רשימה בראשות ' + esc(p.lead) + (p.cp.length > 1 ? ', איחוד של ' + p.cp.map(esc).join(", ") : '') + '. ' +
    (p.k25 ? 'בכנסת ה-' + prev + ': ' + p.k25.map((x) => esc(x.trim())).join(", ") + '.' : 'לא כיהנה בכנסת ה-' + prev + ' כסיעה.');
  const polls = inBan(ctx.now, E) ? '' : '<p class="small"><b>סקרים:</b> ' + (p.med > 0 ? 'חציון ' + p.med + ' מנדטים, טווח ' + p.lo + ' עד ' + p.hi : 'בחציון מתחת לאחוז החסימה') + ', לפי ' + p.pn + ' בתי סקרים, ' + dm(p.pf) + ' עד ' + dm(p.pt) + ' (' + esc(p.outlets) + '). <a href="' + esc(K.polls) + '" target="_blank" rel="noopener">טבלת הסקרים במאגר</a></p>';
  const said = K.cells.filter((c) => c.a === id), pmS = K.pm.filter((c) => c.a === id);
  const gaps = p.gaps.map((q) => {
    const x = cq[q];
    return '<li>' + esc(K.qt[q]) + ': <b>מה שאמרה</b> ' + valWord(x.s) + ' (<a href="' + esc(x.su) + '" target="_blank" rel="noopener">ראיה</a>), <b>מה שעשתה</b> ' + valWord(x.a) + ' (<a href="' + esc(x.au) + '" target="_blank" rel="noopener">ראיה</a>).</li>';
  }).join("");
  const stg = said.concat(pmS).filter((c) => c.st && c.st.length);
  const gen = said.filter((c) => c.gen);
  return '<details class="kcard" id="kc-' + id + '"><summary><span class="letters">' + esc(p.l) + '</span> <b>' + esc(p.n) + '</b> <span class="plead">' + esc(p.lead) + '</span></summary><div class="kcbody">' +
    '<p>' + sentence + '</p>' + polls +
    '<p class="small"><b>' + C.govLabel + '</b> ' + esc(p.gov.t) + ' ' + srcLinks(p.gov.s) + '</p>' +
    (p.cond ? '<p class="small"><b>תנאי כללי לכניסה לממשלה:</b> ' + esc(p.cond.t) + ' ' + srcLinks(p.cond.s) + '</p>' : '') +
    '<h4>מה הצהירה על שותפים</h4>' + (pmS.length || said.length ? pmS.map((c) => stmtHTML(c, 'על ממשלה בראשות ' + esc(listOf(K, c.h as string).lead))).join("") + said.filter((c) => !c.gen).map((c) => stmtHTML(c, 'על ' + nm(K, c.b as string))).join("") + (gen.length ? '<p class="small muted">ועל ' + gen.map((c) => nm(K, c.b as string)).join(", ") + ': רק האמירה הכללית ' + srcLinks(gen[0].s) + '.</p>' : '') : '<p class="small muted">לא נמצאו הצהרות.</p>') +
    (gaps ? '<h4>פער בין מה שאמרה למה שעשתה</h4><p class="small muted">לפי שני הממדים במאגר, בשאלות "עם מי הם ישבו", כשההפרש הוא 2 דרגות או יותר. "מה שעשתה" כולל לפעמים מעשים של ראש הרשימה או של מרכיביה לפני שהרשימה הנוכחית קמה.</p><ul class="check small">' + gaps + '</ul>' : '') +
    (stg.length ? '<p class="small"><b>עמדות שהשתנו:</b> ' + stg.length + ' (השלבים מופיעים ליד כל הצהרה).</p>' : '') +
    (p.nu.length ? '<h4>לשים לב</h4><ul class="check small">' + p.nu.map((x) => '<li>' + esc(x.t) + ' ' + srcLinks(x.s) + '</li>').join("") + '</ul>' : '') +
    '</div></details>';
}

/** Surplus agreements, the five formation steps and the glossary (texts from data/common/formation.json). */
export function formationHTML(ctx: Ctx): string {
  const K = ctx.site.coalition, F = formationContent(ctx), vars = coalVars(ctx);
  const t = (html: string) => lawLinks(F, fill(html, vars));
  return '<h3>הסכמי עודפים</h3><p>' + t(F.surplusIntro) + '</p><ul class="check small">' +
      K.surplus.map((x) => '<li>' + nm(K, x.a) + ' ו' + nm(K, x.b) + ' (' + dmy(x.d) + '). ' + srcLinks(x.s) + '</li>').join("") +
      '<li>' + esc(K.surplusNone.t) + ' ' + srcLinks(K.surplusNone.s) + '</li></ul>' +
    '<h3>' + esc(F.stepsTitle) + '</h3><ol class="check">' + F.steps.map((x) => '<li><b>' + esc(x.title) + '</b> ' + t(x.html) + '</li>').join("") + '</ol>' +
    '<p class="small muted">' + t(F.checkedNote) + '</p>' +
    '<h3>מילון קצר</h3><dl class="kdl">' + F.glossary.map((x) => '<dt>' + esc(x.term) + '</dt><dd>' + t(x.html) + '</dd>').join("") + '</dl>';
}

/** The coalition tab (v5 VIEWS.coalition). */
export function coalition(ctx: Ctx, s: CoalState): string {
  const K = ctx.site.coalition, E = ctx.site.election, C = coalContent(ctx), vars = coalVars(ctx);
  const sm = sums(K, s), cf = conflicts(K, s), ban = inBan(ctx.now, E);
  const top = ban ? '<div class="banner" role="note">' + fill(C.banNotice, vars) + '</div>' : '<p class="small muted">' + fill(C.pollsNote, vars) + '</p>';
  return '<section class="stack" aria-labelledby="h-k"><span class="eyebrow">בונים קואליציה · הצהרות נכון ל-' + K.asof + '</span><h2 id="h-k">בונים קואליציה</h2>' +
    '<p>' + fill(C.intro, vars) + '</p>' + top +
    '<div class="ksticky" id="k-count">' + counterBody(E, sm) + '</div>' + counterNote(E, sm) + sumWarnHTML(E, sm) +
    '<h3>התרחישים המוכנים</h3><p class="small muted">כל תרחיש מסמן "בקואליציה" רק את הרשימות שהודיעו על כך בעצמן, לפי המקורות שמתחתיו, ולא משנה את המנדטים.</p>' + scenHTML(K) +
    '<div class="row"><button type="button" class="btn ghost" data-kact="back"' + (ban ? ' disabled aria-describedby="k-banwhy"' : '') + '>חזרה לסקרים</button><button type="button" class="btn ghost" data-kact="clear">נקה הכול</button><button type="button" class="btn" data-kact="copy">העתקת התרחיש</button></div>' +
    (ban ? '<p class="small muted" id="k-banwhy">"חזרה לסקרים" לא זמין בתקופת איסור פרסום הסקרים.</p>' : '') + '<div id="k-copybox"></div>' +
    '<h3>הרשימות</h3><p class="small muted">סדר הרשימות לפי האלף-בית. לכל רשימה: מנדטים (0, או ' + E.minSeatsIfPassed + ' ומעלה) ומעמד בתרחיש. המצב נשמר רק בדפדפן הזה.</p>' +
    '<div class="ktable">' + K.lists.map((p) => rowHTML(ctx, s, p, cf)).join("") + '</div>' +
    conflictsHTML(ctx, s, cf) +
    '<h3>מי אמר מה על מי</h3><p class="small muted">' + fill(C.matrixIntro, vars) + '</p>' +
    matrixHTML(ctx, s) + '<details class="ctx"><summary>כל הזוגות בטבלה אחת</summary>' + gridHTML(K) + '</details>' +
    formationHTML(ctx) +
    '<h3>הרשימות: מי הן ועם מי אמרו שישבו</h3><p class="small muted">הכלי לא מתאר רשימות במילים כמו "ימין" או "שמאל". כל משפט על עמדה מקושר למקור.</p>' +
    K.lists.map((p) => cardHTML(ctx, p)).join("") +
    '<p class="small muted">' + fill(C.sourcesNote, vars) + '</p></section>';
}
