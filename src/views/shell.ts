/* The non-quiz, non-coalition views, ported from v5 (matrix, parties, tools, decide, method).
   Every election-specific text comes from site.content; the markup is v5's. */
import type { Ctx, ViewModule, QuizParty } from "../types";
import { esc, dm, dmy, fill, electionVars } from "../lib/html";
import { url, fmt, valLabel, valClass, noneLabel, NONE_SHORT } from "../lib/labels";
import { inBan } from "../time";
import { methodSlots } from "./method-slots";

/** Placeholder values for content/pages.json texts. */
export function pageVars(ctx: Ctx): Record<string, string | number> {
  const s = ctx.site, e = s.election;
  return {
    ...electionVars(e), nameHe: e.nameHe, dayHe: e.dayHe, quizAsof: s.quiz.asof, coalAsof: s.coalition.asof,
    siteVersion: ctx.siteVersion, buildDate: dmy(s.build.builtAt), listCount: s.quiz.parties.length, questionCount: s.quiz.questions.length,
    sourceName: e.source.nameHe, sourceAuthor: e.source.author, lookupUrl: e.pollingInfo.lookupUrl, phones: e.pollingInfo.phones.join(" או "),
    sms: e.pollingInfo.sms, registerClosed: dmy(e.pollingInfo.registerClosed), allListsUrl: e.listsAllApprovedUrl ?? "",
    allListsCount: e.listsAllApprovedCount ?? "", noPlatform: s.quiz.parties.filter((p) => !p.pl).length,
  };
}
const pages = (ctx: Ctx) => ctx.site.content.pages;

function matrix(ctx: Ctx): string {
  const D = ctx.site.quiz, P = pages(ctx).matrix, V = pageVars(ctx);
  const head = '<thead><tr><th class="pn" scope="col">היגד</th>' + D.parties.map((p) => '<th scope="col">' + esc(p.n) + "</th>").join("") + "</tr></thead>";
  let lastCat: string | null = null, body = "<tbody>";
  D.questions.forEach((q, qi) => {
    if (q.cat !== lastCat) { body += '<tr><th class="cat" scope="rowgroup" colspan="' + (D.parties.length + 1) + '">' + esc(D.cats[q.cat].t) + "</th></tr>"; lastCat = q.cat; }
    body += '<tr><th class="pn" scope="row" title="' + esc(q.stmt) + '">' + esc(q.label) + "</th>" + D.parties.map((p) => {
      const c = D.cells[p.id][qi];
      const chip = (v: number | null, low: 1 | undefined, x: string | undefined, u: string, lab: string) => {
        if (v === null || v === undefined) return '<span class="v na" title="' + lab + ": " + noneLabel(x) + '">' + ((x && NONE_SHORT[x]) || "?") + "</span>";
        return '<a class="v ' + valClass(v) + (low ? " low" : "") + '" href="' + esc(url(u, D.base)) + '" target="_blank" rel="noopener" title="' + lab + ": " + valLabel(v) + (low ? ", ראיה חלשה" : "") + '">' + fmt(v) + "</a>";
      };
      return '<td><div class="pair"><span class="lab">א</span>' + chip(c.s, c.sl, c.sx, c.su, "אמרו") + '<span class="lab">ע</span>' + chip(c.a, c.al, c.ax, c.au, "עשו") + "</div>" + (c.g ? '<span class="gapmark">פער</span>' : "") + "</td>";
    }).join("") + "</tr>";
  });
  body += "</tbody>";
  return '<section class="stack" aria-labelledby="h-mx"><span class="eyebrow">טבלת העמדות · נכון ל-' + D.asof + '</span><h2 id="h-mx">מה אמרו ומה עשו, בכל היגד</h2>' +
    '<p class="muted small">' + fill(P.intro, V) + "</p>" +
    '<div class="legend"><span><span class="v p2">2+</span> בעד מאוד</span><span><span class="v p1">1+</span> בעד</span><span><span class="v z">0</span> באמצע</span><span><span class="v n1">1-</span> נגד</span><span><span class="v n2">2-</span> נגד מאוד</span></div>' +
    '<div class="tablewrap" tabindex="0" role="region" aria-label="טבלת עמדות, ניתנת לגלילה"><table><caption>' + fill(P.caption, V) + "</caption>" + head + body + "</table></div></section>";
}

function coverage(ctx: Ctx, pid: string) {
  let s = 0, a = 0, any = 0;
  ctx.site.quiz.cells[pid].forEach((x) => { if (x.s !== null) s++; if (x.a !== null) a++; if (x.s !== null || x.a !== null) any++; });
  return { s, a, any };
}
function parties(ctx: Ctx): string {
  const D = ctx.site.quiz, P = pages(ctx).parties, V = pageVars(ctx), ban = inBan(ctx.now, ctx.site.election), nq = D.questions.length;
  const cards = D.parties.map((p: QuizParty) => {
    const cv = coverage(ctx, p.id), sw = p.seats;
    const th = p.th === "below" ? '<span class="tag warn">בסקרים מתחת לאחוז החסימה</span>' : p.th === "near" ? '<span class="tag warn">בסקרים סביב אחוז החסימה</span>' : "";
    const plat = p.pl ? '<a href="' + esc(p.pl) + '" target="_blank" rel="noopener">' + esc(p.pt) + "</a>" : esc(p.pt) + (p.src ? ' <a href="' + esc(p.src) + '" target="_blank" rel="noopener">מקור</a>' : "");
    let seats = sw.median > 0 ? "חציון " + sw.median + " מנדטים (טווח " + sw.low + " עד " + sw.high + ")" : "מתחת לאחוז החסימה";
    seats += ", לפי " + sw.n + " בתי סקרים, " + dm(sw.from) + " עד " + dm(sw.to) + (ban ? P.seatsBanSuffix : "");
    if (p.below.length) seats += ". סקרים שבהם לא עברה: " + p.below.map((b) => esc(dm(b))).join(", ");
    const conduct = p.conduct.total ? p.conduct.total + " (" + p.conduct.parts.map((x) => x[1] + " " + x[0]).join(", ") + ")" : "לא נספרו";
    return '<article class="tool pcard" aria-labelledby="pn-' + p.id + '"><span class="n letters" style="grid-row:span 7;align-self:start;font-family:var(--f-body);font-size:.95rem" title="האותיות בפתק">' + esc(p.letters) + "</span>" +
      '<h3 id="pn-' + p.id + '" style="font-size:1.1rem">' + esc(p.n) + "</h3>" +
      '<span class="td">בראשות ' + esc(p.l) + ". חמשת הראשונים: " + p.top.map(esc).join(", ") + '. <a href="' + esc(p.cand) + '" target="_blank" rel="noopener">הרשימה המלאה (PDF)</a></span>' +
      '<span class="pc"><b>סקרים:</b> ' + seats + "</span>" +
      '<span class="pc"><b>מצע:</b> ' + plat + "</span>" +
      '<span class="pc"><b>מידע בשאלון:</b> עמדה מוצהרת ב-' + cv.s + " מתוך " + nq + " היגדים, עמדה לפי מעשים ב-" + cv.a + ".</span>" +
      '<span class="pc"><b>התנהלות:</b> אירועים שנספרו במאגר: ' + conduct + ". הליכים פליליים נגד מועמדים: " + esc(p.legal) + ". מועמדים שתועדו: " + p.documented + ".</span>" +
      '<span class="pc"><a href="' + esc(D.base + p.id + ".html") + '" target="_blank" rel="noopener">הראיות במאגר</a>' + (p.site ? ' · <a href="' + esc(p.site) + '" target="_blank" rel="noopener">אתר הרשימה</a>' : "") + "</span>" +
      (th ? '<span class="tags" style="grid-column:2">' + th + "</span>" : "") + "</article>";
  }).join("");
  return '<section class="stack" aria-labelledby="h-pt"><span class="eyebrow">הרשימות · נכון ל-' + D.asof + '</span><h2 id="h-pt">' + D.parties.length + " הרשימות שבכלי</h2>" +
    (ban ? '<div class="banner" role="note">' + fill(P.banNotice, V) + "</div>" : "") +
    '<p class="muted small">' + fill(P.intro, V) + "</p>" +
    '<div class="note">' + fill(P.platformsNote, V) + "</div>" +
    '<div class="note">' + fill(P.conductNote, V) + "</div>" +
    '<div class="res">' + cards + "</div>" +
    '<p class="small muted">' + fill(P.footer, V) + "</p></section>";
}

function tools(ctx: Ctx): string {
  const P = pages(ctx).tools, V = pageVars(ctx), T: { n: string; u: string; d: string; p: string; c: string }[] = ctx.site.content.tools.tools;
  return '<section class="stack" aria-labelledby="h-tools"><span class="eyebrow">' + fill(P.eyebrow, V) + '</span><h2 id="h-tools">כדאי להשוות לעוד מקור</h2>' +
    '<p class="muted small">' + fill(P.intro, V) + "</p>" +
    T.map((t, i) => '<div class="tool"><span class="n" aria-hidden="true">' + (i + 1) + '</span><a class="tt" href="' + esc(t.u) + '" target="_blank" rel="noopener">' + esc(t.n) + '</a><span class="td">' + esc(t.d) + '</span><span class="pc"><b>יתרון:</b> ' + esc(t.p) + " <b>חיסרון:</b> " + esc(t.c) + "</span></div>").join("") +
    '<div class="note">' + fill(P.note, V) + "</div>" +
    '<p class="small muted">' + fill(P.footer, V) + "</p></section>";
}

function decide(ctx: Ctx): string {
  const P = pages(ctx).decide, V = pageVars(ctx);
  return '<section class="stack" aria-labelledby="h-dec"><span class="eyebrow">מהתוצאה להחלטה</span><h2 id="h-dec">איך להחליט בלי ליפול להטיות</h2>' +
    '<ol class="check">' + (P.items as string[]).map((t) => "<li>" + fill(t, V) + "</li>").join("") + "</ol>" +
    '<div class="note">' + fill(P.electionDay, V) + "</div></section>";
}

/** marked output to v5 markup: v5 lists carry class "check" and blocks sit without newlines between them. */
function mdToV5(html: string): string { return html.replace(/<ul>/g, '<ul class="check">').replace(/>\s*\n\s*</g, "><").trim(); }
function method(ctx: Ctx): string {
  const c = ctx.site.content, S = methodSlots(ctx.site);
  const log = c.changelog.map((e) => "<li><b>גרסה " + esc(e.version) + " (" + dmy(e.date) + "):</b> " + e.items.join("; ") + "</li>").join("");
  return '<section class="stack" aria-labelledby="h-me"><span class="eyebrow">שקיפות</span><h2 id="h-me">שיטה ומקורות</h2>' +
    fill(mdToV5(c.methodHtml || ""), S) + fill(mdToV5(c.methodNotesHtml || ""), S) +
    '<h3>יומן גרסאות</h3><ul class="check small">' + log + "</ul></section>";
}

export const shellModule: ViewModule = { views: { matrix, parties, tools, decide, method } };
