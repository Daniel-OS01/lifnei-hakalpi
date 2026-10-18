/* ---------- coalition builder (v5): independent of the quiz; its own state and data ---------- */
var K = __COAL__;
var KKEY = "lifnei-hakalpi-coal-v1";
var KL = {}; K.lists.forEach(function(p){ KL[p.id] = p; });
var KIDS = K.lists.map(function(p){ return p.id; });
var LVN = {X:"פוסלת במפורש", C:"פוסלת בתנאי", N:"לא אמרה", O:"פתוחה", P:"הודיעה על שותפות או המלצה", U:"לא ידוע"};
var STN = {"in":"בקואליציה", out:"מחוץ לה", sup:"תמיכה מבחוץ"};
var BAN_F = Date.parse(K.ban.f), BAN_U = Date.parse(K.ban.u);
function nowMs(){ return typeof window.__NOW === "number" ? window.__NOW : Date.now(); }
function inBan(t){ t = t === undefined ? nowMs() : t; return t >= BAN_F && t < BAN_U; }
function kd(iso){ var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ""); return m ? (+m[3]) + "." + (+m[2]) + "." + m[1] : esc(iso || ""); }

function kFresh(t){
  var ban = inBan(t), s = {seats:{}, st:{}, pm:null, polls:!ban, sel:KIDS[0], v:1};
  KIDS.forEach(function(id){ s.seats[id] = ban ? 0 : K.start[id]; s.st[id] = "out"; });
  return s;
}
function validSeat(v){ return typeof v === "number" && isFinite(v) && v === Math.floor(v) && (v === 0 || (v >= 4 && v <= 120)); }
function kSanitize(o, t){
  var s = kFresh(t); if (!o || typeof o !== "object") return s;
  KIDS.forEach(function(id){
    if (o.seats && validSeat(o.seats[id])) s.seats[id] = o.seats[id];
    if (o.st && STN[o.st[id]]) s.st[id] = o.st[id];
  });
  s.polls = !!o.polls; s.pm = o.pm && KL[o.pm] ? o.pm : null; if (o.sel && KL[o.sel]) s.sel = o.sel;
  if (inBan(t) && s.polls){ KIDS.forEach(function(id){ s.seats[id] = 0; }); s.polls = false; }  // no poll numbers as starting values during the ban
  return s;
}
function kLoad(t){ try{ var r = localStorage.getItem(KKEY); return kSanitize(r ? JSON.parse(r) : null, t); }catch(e){ return kFresh(t); } }
function kSave(){ try{ localStorage.setItem(KKEY, JSON.stringify(KS)); }catch(e){} }
var KS = kLoad();

function kSums(s){
  var r = {coal:0, sup:0, total:0, nIn:0};
  KIDS.forEach(function(id){ var v = s.seats[id]; r.total += v; if (s.st[id] === "in"){ r.coal += v; r.nIn++; } else if (s.st[id] === "sup") r.sup += v; });
  return r;
}
function kSetSeat(s, id, v){
  if (typeof v === "string"){ v = v.trim(); if (!/^\d{1,3}$/.test(v)) return {ok:false, msg:"אפשר להזין רק מספר שלם בין 0 ל-120."}; v = parseInt(v, 10); }
  if (v >= 1 && v <= 3) return {ok:false, msg:"רשימה שעוברת את אחוז החסימה מקבלת לפחות 4 מנדטים. אפשר להזין 0 או 4 ומעלה."};
  if (!validSeat(v)) return {ok:false, msg:"אפשר להזין רק מספר שלם בין 0 ל-120."};
  s.seats[id] = v; s.polls = false; return {ok:true};
}
function kStep(s, id, dir){
  var v = s.seats[id];
  if (dir > 0) v = v === 0 ? 4 : Math.min(120, v + 1);
  else v = v <= 4 ? 0 : v - 1;
  s.seats[id] = v; s.polls = false; return v;
}
function kRescale(s){
  var act = KIDS.filter(function(id){ return s.seats[id] > 0; }), S = 0;
  act.forEach(function(id){ S += s.seats[id]; }); if (!S) return false;
  var q = {}, base = {}, used = 0;
  act.forEach(function(id){ q[id] = s.seats[id] * 120 / S; base[id] = Math.floor(q[id]); used += base[id]; });
  act.slice().sort(function(a, b){ return (q[b] - base[b]) - (q[a] - base[a]) || s.seats[b] - s.seats[a]; }).slice(0, 120 - used).forEach(function(id){ base[id]++; });
  // a list that had seats keeps at least 4: lift it and take the seats from the largest lists
  act.forEach(function(id){
    while (base[id] >= 1 && base[id] < 4){
      var donor = act.filter(function(x){ return x !== id && base[x] > 4; }).sort(function(a, b){ return base[b] - base[a]; })[0];
      if (!donor) break; base[donor]--; base[id]++;
    }
  });
  act.forEach(function(id){ s.seats[id] = base[id]; }); s.polls = false; return true;
}
function kBack(s, t){ if (inBan(t)) return false; KIDS.forEach(function(id){ s.seats[id] = K.start[id]; }); s.polls = true; return true; }
function kClear(s){ KIDS.forEach(function(id){ s.seats[id] = 0; s.st[id] = "out"; }); s.pm = null; s.polls = false; }
function cellOf(a, b){ for (var i = 0; i < K.cells.length; i++){ var c = K.cells[i]; if (c.a === a && c.b === b) return c; } return null; }
function pmOf(a, h){ for (var i = 0; i < K.pm.length; i++){ var c = K.pm[i]; if (c.a === a && c.h === h) return c; } return null; }

/* conflict check: refusals (X, C) between coalition members; PM statements; outside support checked only against the outside-support question */
function kConflicts(s){
  var inn = KIDS.filter(function(id){ return s.st[id] === "in"; }), sup = KIDS.filter(function(id){ return s.st[id] === "sup"; });
  var hard = [], cond = [], info = [], unknown = [], pmMaybe = [];
  inn.forEach(function(a){ inn.forEach(function(b){
    if (a === b) return; var c = cellOf(a, b);
    if (!c){ unknown.push([a, b]); return; }
    if (c.lv === "X") hard.push({k:"pair", a:a, b:b, c:c});
    else if (c.lv === "C") cond.push({k:"pair", a:a, b:b, c:c});
    else info.push({k:"pair", a:a, b:b, c:c});
  }); });
  var pm = s.pm && s.st[s.pm] === "in" ? s.pm : null;
  inn.forEach(function(a){
    K.pm.forEach(function(p){
      if (p.a !== a || s.st[p.h] !== "in" || p.a === p.h) return;
      if (p.lv !== "X" && p.lv !== "C") return;
      if (pm === p.h){ (p.lv === "X" ? hard : cond).push({k:"pm", a:a, b:p.h, c:p}); }
      else if (!pm) pmMaybe.push({k:"pm", a:a, b:p.h, c:p});
    });
  });
  sup.forEach(function(b){
    if (K.arab.indexOf(b) < 0){ info.push({k:"supnote", b:b}); return; }
    inn.forEach(function(a){
      var o = K.out[a]; if (!o) return;
      if (o.lv === "X") hard.push({k:"out", a:a, b:b, c:o});
      else if (o.lv === "N") info.push({k:"outn", a:a, b:b, c:o});
    });
  });
  return {hard:hard, cond:cond, pmMaybe:pmMaybe, info:info, unknown:unknown, pm:pm};
}
function kAllSrc(){ var a = []; K.cells.concat(K.pm).forEach(function(c){ a = a.concat(c.s); (c.st || []).forEach(function(x){ a = a.concat(x.s); }); }); Object.keys(K.out).forEach(function(k){ a = a.concat(K.out[k].s); }); K.lists.forEach(function(p){ a = a.concat(p.gov.s); if (p.cond) a = a.concat(p.cond.s); p.nu.forEach(function(x){ a = a.concat(x.s); }); }); K.surplus.forEach(function(x){ a = a.concat(x.s); }); return a; }
function kClaimCount(){ var u = {}; kAllSrc().forEach(function(x){ if (x.e && x.e.indexOf("#claim-") > 0) u[x.e] = 1; }); return Object.keys(u).length; }
function kExt(){ var only = 0, mixed = 0; K.cells.concat(K.pm).forEach(function(c){ var ex = c.s.filter(function(x){ return x.x; }).length; if (ex && ex === c.s.length) only++; else if (ex) mixed++; }); return {only:only, mixed:mixed}; }
window.__coal = {K:K, fresh:kFresh, sanitize:kSanitize, sums:kSums, setSeat:kSetSeat, step:kStep, rescale:kRescale, back:kBack, clear:kClear, conflicts:kConflicts, inBan:inBan, cellOf:cellOf, text:function(s){ return kText(s); }, views:VIEWS, get:function(){ return KS; }, set:function(s){ KS = s; }, save:function(){ kSave(); }, load:function(t){ return kLoad(t); }, key:KKEY};

function srcLinks(arr){
  return arr.map(function(x){
    var a = [];
    if (x.u) a.push('<a href="' + esc(x.u) + '" target="_blank" rel="noopener">' + esc(x.o || "מקור") + '</a>');
    if (x.e) a.push('<a href="' + esc(x.e) + '" target="_blank" rel="noopener">' + (x.u ? "הראיה במאגר" : esc(x.o || "המאגר")) + '</a>');
    if (x.x) a.push('<span class="tag">לא מהמאגר</span>');
    return a.join(" · ");
  }).join(" · ");
}
function lvChip(lv){ return '<span class="lv lv-' + lv + '">' + LVN[lv] + '</span>'; }
function stagesHTML(st){
  if (!st || !st.length) return "";
  return '<div class="stages"><b>שלב קודם:</b> ' + st.map(function(x){ return kd(x.d) + ', ' + LVN[x.lv] + (x.cond ? ' (' + esc(x.cond) + ')' : '') + ': ' + esc(x.t) + ' ' + srcLinks(x.s); }).join("<br>") + '<br><span class="muted">האמירה המאוחרת מכריעה.</span></div>';
}
function stmtHTML(c, who){
  return '<div class="stmt-i">' + (who ? '<span class="who">' + who + '</span>' : '') + lvChip(c.lv) + (c.cond ? ' <span class="cond">התנאי: ' + esc(c.cond) + '</span>' : '') +
    '<p>' + esc(c.t) + '</p><p class="small muted">' + [c.d ? kd(c.d) : '', c.rep ? 'לפי דיווח, לא ציטוט ישיר' : '', c.gen ? 'אמירה כללית' : '', c.db ? '<span dir="rtl">ערך במאגר: <span dir="ltr">' + (c.db.v > 0 ? "+" : "") + c.db.v + '</span>' + (c.db.c ? ", ביטחון " + ({h:"גבוה", m:"בינוני", l:"נמוך"})[c.db.c] : "") + (c.db.im ? ", משתמע" : "") + '</span>' : '', srcLinks(c.s)].filter(Boolean).join(' · ') + '</p>' + stagesHTML(c.st) + '</div>';
}
function nm(id){ return esc(KL[id].sn); }
function conflictHTML(x){
  var c = x.c, head;
  if (x.k === "pair") head = nm(x.a) + ' על ' + nm(x.b);
  else if (x.k === "pm") head = nm(x.a) + ' על ממשלה בראשות ' + esc(KL[x.b].lead);
  else if (x.k === "out" || x.k === "outn") head = nm(x.a) + ' על תמיכה מבחוץ של מפלגות ערביות (כאן: ' + nm(x.b) + ')';
  else return '<li class="ci note-i">' + nm(x.b) + ' מסומנת כתמיכה מבחוץ. במאגר יש שאלה על תמיכה מבחוץ רק לגבי מפלגות ערביות, ולכן התמיכה הזו לא נבדקה מול הצהרות.</li>';
  return '<li class="ci">' + stmtHTML(c, head) + '</li>';
}

function kText(s){
  var sm = kSums(s), cf = kConflicts(s);
  var L = ["תרחיש קואליציה מהכלי \"לפני הקלפי\". זה תרחיש שנבנה ידנית, לא תחזית ולא המלצה."];
  var row = function(id){ return KL[id].sn + ": " + s.seats[id]; };
  var inn = KIDS.filter(function(id){ return s.st[id] === "in"; }), sup = KIDS.filter(function(id){ return s.st[id] === "sup"; });
  L.push("בקואליציה (" + sm.coal + " מנדטים מתוך 61 הדרושים לרוב): " + (inn.length ? inn.map(row).join(", ") : "אין"));
  if (sup.length) L.push("תמיכה מבחוץ (" + sm.sup + "): " + sup.map(row).join(", "));
  L.push("סך כל המנדטים בתרחיש: " + sm.total + " מתוך 120." + (s.polls ? " המנדטים לפי חציון הסקרים במאגר \"מה אמרו, ומה עשו\" (" + K.lists.map(function(p){ return pctD(p.pt); }).filter(function(v, i, a){ return a.indexOf(v) === i; }).join(", ") + ")." : " המנדטים הוזנו ידנית."));
  if (cf.pm) L.push("ראש הממשלה בתרחיש: " + KL[cf.pm].lead + ".");
  var all = cf.hard.concat(cf.cond);
  if (all.length){ L.push("התנגשויות עם הצהרות מתועדות:"); all.forEach(function(x){ L.push("- " + plain(x) + " (" + kd(x.c.d) + ")"); }); }
  else L.push("לא נמצאו התנגשויות עם הצהרות מתועדות" + (cf.pmMaybe.length ? ", אבל יש הצהרות שתלויות בזהות ראש הממשלה." : "."));
  if (cf.pmMaybe.length) cf.pmMaybe.forEach(function(x){ L.push("- תלוי בראש הממשלה: " + plain(x)); });
  if (cf.unknown.length) L.push("זוגות בלי מידע מתועד: " + cf.unknown.length + ".");
  L.push("הצהרות לפי המאגר \"מה אמרו, ומה עשו\", נכון ל-" + K.asof + ", ומקורות ראשוניים שסומנו.");
  return L.join("\n");
}
function plain(x){
  var c = x.c;
  if (x.k === "pair") return KL[x.a].sn + " על " + KL[x.b].sn + ": " + LVN[c.lv] + (c.cond ? " (התנאי: " + c.cond + ")" : "");
  if (x.k === "pm") return KL[x.a].sn + " על ממשלה בראשות " + KL[x.b].lead + ": " + LVN[c.lv] + (c.cond ? " (התנאי: " + c.cond + ")" : "");
  return KL[x.a].sn + " על תמיכה מבחוץ של " + KL[x.b].sn + ": פוסלת במפורש";
}
function pctD(iso){ var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso); return (+m[3]) + "." + (+m[2]); }
function copyScenario(){
  var txt = kText(KS);
  function fallback(){ var ta = document.createElement("textarea"); ta.value = txt; ta.setAttribute("aria-label","התרחיש להעתקה"); ta.rows = 10; var box = document.getElementById("k-copybox"); (box || view).appendChild(ta); ta.focus(); ta.select(); toast("ההעתקה האוטומטית לא עבדה. הטקסט מסומן, אפשר להעתיק אותו ידנית."); }
  try{ navigator.clipboard.writeText(txt).then(function(){ toast("התרחיש הועתק"); }, fallback); }catch(err){ fallback(); }
}

function kRowHTML(p, cf){
  var id = p.id, st = KS.st[id], v = KS.seats[id];
  var mine = cf.hard.concat(cf.cond).filter(function(x){ return x.a === id || x.b === id; }).length;
  var med = inBan() ? '' : '<span class="small muted">חציון ' + p.med + ' (טווח ' + p.lo + ' עד ' + p.hi + ')</span>';
  return '<div class="krow st-' + st + '" id="kr-' + id + '">' +
    '<div class="kname"><span class="letters" title="האותיות בפתק">' + esc(p.l) + '</span> <b>' + esc(p.sn) + '</b> <span class="plead">' + esc(p.lead) + '</span>' +
      (p.cp.length > 1 ? '<span class="small muted kcp">' + p.cp.map(esc).join(" + ") + '</span>' : '') +
      (mine && st === "in" ? ' <a class="tag red" href="#k-conf">התנגשויות: ' + mine + '</a>' : '') + '</div>' +
    '<div class="kseats"><button type="button" class="kb" data-kstep="-1" data-kid="' + id + '" aria-label="הורדת מנדט מ' + esc(p.sn) + '">−</button>' +
      '<label class="sr" for="ks-' + id + '">מנדטים ל' + esc(p.sn) + '</label><input id="ks-' + id + '" class="kin" type="text" inputmode="numeric" autocomplete="off" value="' + v + '" data-kseat="' + id + '">' +
      '<button type="button" class="kb" data-kstep="1" data-kid="' + id + '" aria-label="הוספת מנדט ל' + esc(p.sn) + '">+</button>' + med + '</div>' +
    '<fieldset class="kst"><legend class="sr">מעמד ' + esc(p.sn) + ' בתרחיש</legend>' +
      ["in", "out", "sup"].map(function(k){ return '<label class="' + (st === k ? "on" : "") + '"><input type="radio" name="kst-' + id + '" value="' + k + '" data-kst="' + k + '" data-kid="' + id + '"' + (st === k ? " checked" : "") + '>' + STN[k] + '</label>'; }).join("") + '</fieldset>' +
    '<p class="kerr small" id="ke-' + id + '" role="alert"></p></div>';
}

function sumWarnHTML(sm){
  if (sm.total === 0) return '<p class="note">עדיין לא הוזנו מנדטים. אפשר להקליד מספר ליד כל רשימה או להשתמש בכפתורי הפלוס והמינוס.</p>';
  return sm.total === 120 ? '' :
    '<div class="kwarn" role="alert"><b>סך כל המנדטים הוא ' + sm.total + ', לא 120.</b> בכנסת יש בדיוק 120 מושבים. אפשר לתקן ידנית, או להתאים את כל הרשימות לפי היחס ביניהן. רשימה עם מנדטים לא תרד מתחת ל-4. <button type="button" class="btn quiet" data-kact="rescale"' + (sm.total ? '' : ' disabled') + '>התאם יחסית ל-120</button></div>';
}
function counterBody(sm){
  var scale = Math.max(120, sm.total), w = function(n){ return (100 * n / scale).toFixed(2) + "%"; };
  var rest = Math.max(0, sm.total - sm.coal - sm.sup);
  return '<div class="kcount" role="group" aria-label="מונה המנדטים"><div class="knums"><span><b>' + sm.coal + '</b> בקואליציה <span class="muted">מתוך 61 הדרושים</span></span>' +
    (sm.sup ? '<span><b>' + sm.sup + '</b> תמיכה מבחוץ</span>' : '') +
    '<span><b>' + sm.total + '</b> סך הכול <span class="muted">מתוך 120</span></span></div>' +
    '<div class="kbar" role="img" aria-label="' + sm.coal + ' בקואליציה, ' + sm.sup + ' בתמיכה מבחוץ, ' + rest + ' אחרים, מתוך ' + sm.total + '">' +
      '<i class="b-in" style="width:' + w(sm.coal) + '"></i><i class="b-sup" style="width:' + w(sm.sup) + '"></i><i class="b-rest" style="width:' + w(rest) + '"></i>' +
      '<span class="m61" style="inset-inline-start:' + w(61) + '" title="61"></span>' + (scale > 120 ? '<span class="m120" style="inset-inline-start:' + w(120) + '" title="120"></span>' : '') + '</div>' +
'</div>';
}
function counterNote(sm){
  return '<div class="legend"><span><i class="sw b-in"></i>בקואליציה</span><span><i class="sw b-sup"></i>תמיכה מבחוץ</span><span><i class="sw b-rest"></i>מחוץ לקואליציה</span><span>הקו: 61, רוב מכלל חברי הכנסת</span></div>' +
    (sm.coal >= 61 ? '<p class="small">לקואליציה בתרחיש יש רוב של ' + sm.coal + ' מתוך 120.</p>' : (sm.coal ? '<p class="small">חסרים ' + (61 - sm.coal) + ' מנדטים לרוב של 61. ממשלה בלי 61 יכולה לקום רק אם חלק מהאחרים יתמכו מבחוץ או יימנעו בהצבעת האמון (ראו "ממשלת מיעוט" במילון).</p>' : ''));
}

function conflictsHTML(cf){
  var n = cf.hard.length + cf.cond.length;
  var inn = KIDS.filter(function(id){ return KS.st[id] === "in"; });
  var pmSel = '<label class="kpm">ראש הממשלה בתרחיש: <select data-kpm="1"><option value="">לא נקבע</option>' + inn.map(function(id){ return '<option value="' + id + '"' + (cf.pm === id ? " selected" : "") + '>' + esc(KL[id].lead) + ' (' + esc(KL[id].sn) + ')</option>'; }).join("") + '</select></label>';
  var h = '<section id="k-conf" class="kconf" aria-labelledby="h-kc" tabindex="-1"><h3 id="h-kc">בדיקת התנגשויות</h3>' + (inn.length ? pmSel : '');
  if (!inn.length) return h + '<p class="muted small">סמנו רשימות "בקואליציה" כדי לבדוק אם הצירוף סותר הצהרות שלהן.</p></section>';
  if (n) h += '<p><b class="bad">' + n + ' הצהרות מתועדות סותרות את הצירוף.</b> "פוסלת במפורש" ו"פוסלת בתנאי" מוצגות בנפרד.</p>';
  else h += '<p>לא נמצאה בצירוף הזה הצהרה מתועדת שסותרת אותו.' + (cf.unknown.length ? ' זה לא אומר שאין התנגדות: על חלק מהזוגות אין מידע.' : '') + '</p>';
  if (cf.hard.length) h += '<h4>פוסלת במפורש</h4><ul class="clist hard">' + cf.hard.map(conflictHTML).join("") + '</ul>';
  if (cf.cond.length) h += '<h4>פוסלת בתנאי</h4><ul class="clist cond">' + cf.cond.map(conflictHTML).join("") + '</ul>';
  if (cf.pmMaybe.length) h += '<h4>תלוי בזהות ראש הממשלה</h4><p class="small muted">ההצהרות האלה עוסקות בראש הממשלה. בחרו ראש ממשלה למעלה כדי לראות אם הן חלות.</p><ul class="clist maybe">' + cf.pmMaybe.map(conflictHTML).join("") + '</ul>';
  var other = cf.info.filter(function(x){ return x.k === "pair" && (x.c.lv === "P" || x.c.lv === "O"); });
  var nn = cf.info.filter(function(x){ return x.k !== "pair" || x.c.lv === "N"; });
  if (other.length || nn.length) h += '<details class="ctx"><summary>הצהרות נוספות בין הרשימות שבחרת (' + (other.length + nn.length) + ')</summary><ul class="clist">' + other.concat(nn).map(conflictHTML).join("") + '</ul></details>';
  if (cf.unknown.length) h += '<p class="small muted">' + cf.unknown.length + ' זוגות בצירוף בלי מידע מתועד ("לא ידוע"): ' + cf.unknown.map(function(x){ return nm(x[0]) + ' על ' + nm(x[1]); }).join("; ") + '.</p>';
  return h + '</section>';
}

function scenHTML(){
  function srcFor(sc){
    var out = [];
    if (sc.id === "pm-netanyahu") K.pm.forEach(function(p){ if (p.h === "likud" && p.lv === "P" && sc.lists.indexOf(p.a) >= 0) out.push(nm(p.a) + ': ' + srcLinks(p.s)); });
    if (sc.id === "no-netanyahu") K.pm.forEach(function(p){ if (p.h === "likud" && p.lv === "X" && sc.lists.indexOf(p.a) >= 0) out.push(nm(p.a) + ': ' + srcLinks(p.s)); });
    if (sc.id === "yashar-partners"){ var c = cellOf("yashar", "beyahad"); out.push(nm("yashar") + ': ' + srcLinks(c.s)); }
    return out.join("<br>");
  }
  return '<div class="kscen">' + K.scen.map(function(sc){
    return '<div class="kscard"><button type="button" class="btn ghost" data-kscen="' + sc.id + '">' + esc(sc.t) + '</button><p class="small muted">' + esc(sc.why) + '</p><p class="small">' + srcFor(sc) + '</p></div>';
  }).join("") + '</div>';
}

function matrixHTML(){
  var sel = KS.sel, p = KL[sel];
  var said = KIDS.filter(function(b){ return b !== sel; }).map(function(b){ var c = cellOf(sel, b); return {b:b, c:c}; });
  var about = KIDS.filter(function(a){ return a !== sel; }).map(function(a){ return {a:a, c:cellOf(a, sel)}; });
  var known = said.filter(function(x){ return x.c; }), unk = said.filter(function(x){ return !x.c; });
  var kn2 = about.filter(function(x){ return x.c; }), unk2 = about.filter(function(x){ return !x.c; });
  var pmS = K.pm.filter(function(x){ return x.a === sel; }), pmA = K.pm.filter(function(x){ return x.h === sel; });
  var opts = K.lists.map(function(q){ return '<option value="' + q.id + '"' + (q.id === sel ? " selected" : "") + '>' + esc(q.sn) + '</option>'; }).join("");
  var h = '<label class="kpm">בחרו רשימה: <select data-ksel="1">' + opts + '</select></label>';
  h += '<div class="kmx"><div><h4>מה ' + esc(p.sn) + ' אמרה על רשימות אחרות</h4>' +
    (pmS.length ? pmS.map(function(c){ return stmtHTML(c, 'על ממשלה בראשות ' + esc(KL[c.h].lead)); }).join("") : '') +
    known.map(function(x){ return stmtHTML(x.c, 'על ' + nm(x.b)); }).join("") +
    (K.out[sel] ? stmtHTML(K.out[sel].lv ? {lv:K.out[sel].lv, t:K.out[sel].t, d:"", s:K.out[sel].s, st:[]} : K.out[sel], 'על תמיכה מבחוץ של מפלגות ערביות') : '') +
    (unk.length ? '<p class="small muted"><b>לא ידוע</b> (אין הצהרה מתועדת במאגר או במקור ראשוני שבדקתי): ' + unk.map(function(x){ return nm(x.b); }).join(", ") + '.</p>' : '') + '</div>' +
    '<div><h4>מה רשימות אחרות אמרו על ' + esc(p.sn) + '</h4>' +
    (pmA.length ? pmA.map(function(c){ return stmtHTML(c, nm(c.a) + ' על ממשלה בראשות ' + esc(p.lead)); }).join("") : '') +
    kn2.map(function(x){ return stmtHTML(x.c, nm(x.a)); }).join("") +
    (unk2.length ? '<p class="small muted"><b>לא ידוע:</b> ' + unk2.map(function(x){ return nm(x.a); }).join(", ") + '.</p>' : '') + '</div></div>';
  return h;
}
function gridHTML(){
  var head = '<tr><th class="pn" scope="col">מי אמרה \\ על מי</th>' + K.lists.map(function(q){ return '<th scope="col" title="' + esc(q.sn) + '">' + esc(q.l) + '</th>'; }).join("") + '</tr>';
  var sym = {X:"✕", C:"<span dir=\"ltr\">✕?</span>", N:"·", O:"○", P:"●"};
  var rows = K.lists.map(function(a){
    return '<tr><th class="pn" scope="row">' + esc(a.sn) + '</th>' + K.lists.map(function(b){
      if (a.id === b.id) return '<td class="self" aria-label="אותה רשימה">-</td>';
      var c = cellOf(a.id, b.id), lv = c ? c.lv : "U";
      return '<td><span class="g g-' + lv + '" title="' + esc(a.sn) + ' על ' + esc(b.sn) + ': ' + LVN[lv] + '">' + (sym[lv] || "?") + '</span><span class="sr">' + esc(a.sn) + ' על ' + esc(b.sn) + ': ' + LVN[lv] + '</span></td>';
    }).join("") + '</tr>';
  }).join("");
  return '<p class="small muted">שורה: הרשימה שאמרה. עמודה: הרשימה שעליה נאמר, לפי האותיות בפתק. <b>✕</b> פוסלת במפורש, <b>✕?</b> פוסלת בתנאי, <b>·</b> לא אמרה, <b>○</b> פתוחה, <b>●</b> הודיעה על שותפות או המלצה, <b>?</b> לא ידוע. ההצהרות על ראשות הממשלה מופיעות בבחירת רשימה, לא בטבלה.</p><div class="tablewrap"><table class="kgrid"><caption class="sr">מי אמר מה על מי</caption><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
}

function cardHTML(p){
  var id = p.id, cq = K.cq[id];
  var sentence = 'רשימה בראשות ' + esc(p.lead) + (p.cp.length > 1 ? ', איחוד של ' + p.cp.map(esc).join(", ") : '') + '. ' +
    (p.k25 ? 'בכנסת ה-25: ' + p.k25.map(function(x){ return esc(x.trim()); }).join(", ") + '.' : 'לא כיהנה בכנסת ה-25 כסיעה.');
  var polls = inBan() ? '' : '<p class="small"><b>סקרים:</b> ' + (p.med > 0 ? 'חציון ' + p.med + ' מנדטים, טווח ' + p.lo + ' עד ' + p.hi : 'בחציון מתחת לאחוז החסימה') + ', לפי ' + p.pn + ' בתי סקרים, ' + pctD(p.pf) + ' עד ' + pctD(p.pt) + ' (' + esc(p.outlets) + '). <a href="' + esc(K.polls) + '" target="_blank" rel="noopener">טבלת הסקרים במאגר</a></p>';
  var said = K.cells.filter(function(c){ return c.a === id; }), pmS = K.pm.filter(function(c){ return c.a === id; });
  var gaps = p.gaps.map(function(q){
    var x = cq[q];
    return '<li>' + esc(K.qt[q]) + ': <b>מה שאמרה</b> ' + valWord(x.s) + ' (<a href="' + esc(x.su) + '" target="_blank" rel="noopener">ראיה</a>), <b>מה שעשתה</b> ' + valWord(x.a) + ' (<a href="' + esc(x.au) + '" target="_blank" rel="noopener">ראיה</a>).</li>';
  }).join("");
  var stg = said.concat(pmS).filter(function(c){ return c.st && c.st.length; });
  return '<details class="kcard" id="kc-' + id + '"><summary><span class="letters">' + esc(p.l) + '</span> <b>' + esc(p.n) + '</b> <span class="plead">' + esc(p.lead) + '</span></summary><div class="kcbody">' +
    '<p>' + sentence + '</p>' + polls +
    '<p class="small"><b>ממשלות מאז 2020:</b> ' + esc(p.gov.t) + ' ' + srcLinks(p.gov.s) + '</p>' +
    (p.cond ? '<p class="small"><b>תנאי כללי לכניסה לממשלה:</b> ' + esc(p.cond.t) + ' ' + srcLinks(p.cond.s) + '</p>' : '') +
    '<h4>מה הצהירה על שותפים</h4>' + (pmS.length || said.length ? pmS.map(function(c){ return stmtHTML(c, 'על ממשלה בראשות ' + esc(KL[c.h].lead)); }).join("") + said.filter(function(c){ return !c.gen; }).map(function(c){ return stmtHTML(c, 'על ' + nm(c.b)); }).join("") + (said.some(function(c){ return c.gen; }) ? '<p class="small muted">ועל ' + said.filter(function(c){ return c.gen; }).map(function(c){ return nm(c.b); }).join(", ") + ': רק האמירה הכללית ' + srcLinks(said.filter(function(c){ return c.gen; })[0].s) + '.</p>' : '') : '<p class="small muted">לא נמצאו הצהרות.</p>') +
    (gaps ? '<h4>פער בין מה שאמרה למה שעשתה</h4><p class="small muted">לפי שני הממדים במאגר, בשאלות "עם מי הם ישבו", כשההפרש הוא 2 דרגות או יותר. "מה שעשתה" כולל לפעמים מעשים של ראש הרשימה או של מרכיביה לפני שהרשימה הנוכחית קמה.</p><ul class="check small">' + gaps + '</ul>' : '') +
    (stg.length ? '<p class="small"><b>עמדות שהשתנו:</b> ' + stg.length + ' (השלבים מופיעים ליד כל הצהרה).</p>' : '') +
    (p.nu.length ? '<h4>לשים לב</h4><ul class="check small">' + p.nu.map(function(x){ return '<li>' + esc(x.t) + ' ' + srcLinks(x.s) + '</li>'; }).join("") + '</ul>' : '') +
    '</div></details>';
}
function valWord(v){ return v === null ? "אין ערך" : ({"2":"בעד במידה רבה", "1":"בעד", "0":"באמצע", "-1":"נגד", "-2":"נגד במידה רבה"})[String(Math.round(v))] + ' (' + (v > 0 ? "+" : "") + v + ')'; }

var LAW = {
  gov:"https://he.wikisource.org/wiki/%D7%97%D7%95%D7%A7-%D7%99%D7%A1%D7%95%D7%93:_%D7%94%D7%9E%D7%9E%D7%A9%D7%9C%D7%94",
  knesset:"https://he.wikisource.org/wiki/%D7%97%D7%95%D7%A7-%D7%99%D7%A1%D7%95%D7%93:_%D7%94%D7%9B%D7%A0%D7%A1%D7%AA",
  lex:"https://main.knesset.gov.il/About/Lexicon/Pages/formation-government.aspx",
  elect:"https://he.wikisource.org/wiki/%D7%97%D7%95%D7%A7_%D7%94%D7%91%D7%97%D7%99%D7%A8%D7%95%D7%AA_%D7%9C%D7%9B%D7%A0%D7%A1%D7%AA",
  prop:"https://he.wikisource.org/wiki/%D7%97%D7%95%D7%A7_%D7%94%D7%91%D7%97%D7%99%D7%A8%D7%95%D7%AA_(%D7%93%D7%A8%D7%9B%D7%99_%D7%AA%D7%A2%D7%9E%D7%95%D7%9C%D7%94)"
};
function lawA(k, t){ return '<a href="' + LAW[k] + '" target="_blank" rel="noopener">' + t + '</a>'; }

VIEWS.coalition = function(){
  var sm = kSums(KS), cf = kConflicts(KS), ban = inBan();
  var top = ban ? '<div class="banner" role="note"><b>תקופת איסור פרסום סקרים</b> (מסוף יום שישי 23.10.2026 ועד סגירת הקלפיות). בתקופה הזו העמוד לא טוען מספרי סקרים. הזינו את המנדטים בעצמכם.</div>' :
    '<p class="small muted">המנדטים בפתיחה הם חציון בתי הסקרים במאגר "מה אמרו, ומה עשו" (סקרים מ-' + pctD(K.lists.reduce(function(m, p){ return p.pf < m ? p.pf : m; }, "9999")) + ' עד ' + pctD(K.lists.reduce(function(m, p){ return p.pt > m ? p.pt : m; }, "0000")) + '.2026, <a href="' + esc(K.polls) + '" target="_blank" rel="noopener">טבלת הסקרים</a>). חציון של חצי מנדט מעוגל כלפי מטה. ליד כל רשימה מופיעים החציון והטווח. מתחילת איסור פרסום הסקרים, 24.10.2026, העמוד לא יטען מספרי סקרים.</p>';
  return '<section class="stack" aria-labelledby="h-k"><span class="eyebrow">בונים קואליציה · הצהרות נכון ל-' + K.asof + '</span><h2 id="h-k">בונים קואליציה</h2>' +
    '<p>כאן אפשר לנסות צירופים של רשימות ולראות שני דברים: אם יש להן יחד 61 מנדטים, והאם הצירוף סותר משהו שהרשימות עצמן אמרו. זה כלי הסבר והדמיה. הוא לא חוזה מה יקרה, לא מדרג צירופים ולא ממליץ על ממשלה. הלשונית לא משתמשת בתשובות שלך בשאלון ולא משנה אותן.</p>' + top +
    '<div class="ksticky" id="k-count">' + counterBody(sm) + '</div>' + counterNote(sm) + sumWarnHTML(sm) +
    '<h3>התרחישים המוכנים</h3><p class="small muted">כל תרחיש מסמן "בקואליציה" רק את הרשימות שהודיעו על כך בעצמן, לפי המקורות שמתחתיו, ולא משנה את המנדטים.</p>' + scenHTML() +
    '<div class="row"><button type="button" class="btn ghost" data-kact="back"' + (ban ? ' disabled aria-describedby="k-banwhy"' : '') + '>חזרה לסקרים</button><button type="button" class="btn ghost" data-kact="clear">נקה הכול</button><button type="button" class="btn" data-kact="copy">העתקת התרחיש</button></div>' +
    (ban ? '<p class="small muted" id="k-banwhy">"חזרה לסקרים" לא זמין בתקופת איסור פרסום הסקרים.</p>' : '') + '<div id="k-copybox"></div>' +
    '<h3>הרשימות</h3><p class="small muted">סדר הרשימות לפי האלף-בית. לכל רשימה: מנדטים (0, או 4 ומעלה) ומעמד בתרחיש. המצב נשמר רק בדפדפן הזה.</p>' +
    '<div class="ktable">' + K.lists.map(function(p){ return kRowHTML(p, cf); }).join("") + '</div>' +
    conflictsHTML(cf) +
    '<h3>מי אמר מה על מי</h3><p class="small muted">חמש דרגות, רק לפי הצהרה או מעשה מתועדים עם מקור ותאריך. בלי מקור הערך הוא "לא ידוע". עמדה לא נגזרת מאידיאולוגיה, מגוש או מהצבעה בנושא אחר, ודברים של מועמד שלא דיבר בשם הרשימה לא נחשבים עמדת הרשימה. הסימון לא סימטרי: מה שרשימה א\' אמרה על ב\' לא אומר דבר על מה ש-ב\' אמרה על א\'. "מפלגות ערביות" ו"מפלגות חרדיות" הם כינויים של הדוברים עצמם. המאגר משייך אותם לרע"ם ולרשימה המשותפת, ולש"ס וליהדות התורה.</p>' +
    matrixHTML() + '<details class="ctx"><summary>כל הזוגות בטבלה אחת</summary>' + gridHTML() + '</details>' +
    '<h3>הסכמי עודפים</h3><p>הסכם עודפים הוא הסכם בין שתי רשימות לגבי המושבים שנשארים אחרי החלוקה הראשונה. לפי ' + lawA("elect", "חוק הבחירות לכנסת") + ', שתי רשימות שחתמו "ייחשבו לענין חלוקת המנדטים... כרשימה אחת", בתנאי שכל אחת מהן עברה את אחוז החסימה. ההסכם לא מחייב את הרשימות לשבת יחד בממשלה, ואינו התחייבות קואליציונית.</p><ul class="check small">' +
      K.surplus.map(function(x){ return '<li>' + nm(x.a) + ' ו' + nm(x.b) + ' (' + kd(x.d) + '). ' + srcLinks(x.s) + '</li>'; }).join("") +
      '<li>' + esc(K.surplusNone.t) + ' ' + srcLinks(K.surplusNone.s) + '</li></ul>' +
    '<h3>איך נבנית ממשלה, בחמישה צעדים</h3><ol class="check">' +
      '<li><b>בוחרים.</b> רשימה שקיבלה לפחות 3.25% מהקולות הכשרים נכנסת לכנסת, ו-120 המושבים מתחלקים בין הרשימות שעברו. (' + lawA("elect", "חוק הבחירות לכנסת, סעיף 81") + ')</li>' +
      '<li><b>התייעצויות.</b> בתוך שבעה ימים מפרסום התוצאות, נשיא המדינה מתייעץ עם נציגי הסיעות ומטיל על חבר כנסת שהסכים לכך את התפקיד להרכיב ממשלה. בהתייעצויות כל סיעה אומרת על מי היא ממליצה. (' + lawA("gov", "חוק-יסוד: הממשלה, סעיף 7") + ')</li>' +
      '<li><b>28 ימים.</b> לחבר הכנסת יש 28 ימים להרכיב ממשלה, והנשיא רשאי להאריך אותם בעוד 14 ימים לכל היותר. (' + lawA("gov", "סעיף 8") + ', <a href="' + LAW.lex + '" target="_blank" rel="noopener">לקסיקון הכנסת</a>)</li>' +
      '<li><b>אם הוא לא מצליח.</b> בתוך שלושה ימים הנשיא מטיל את התפקיד על חבר כנסת אחר, שמקבל 28 ימים, או מודיע שאינו רואה אפשרות להקים ממשלה. אחר כך רוב חברי הכנסת יכולים לבקש בכתב שהתפקיד יוטל על חבר כנסת מסוים, ולו יש 14 ימים. אם גם זה לא קורה, רואים את הכנסת כאילו התפזרה, והבחירות נערכות ביום שלישי האחרון לפני תום 90 ימים. (' + lawA("gov", "סעיפים 9 עד 11") + ')</li>' +
      '<li><b>הצבעת אמון.</b> הממשלה מתייצבת לפני הכנסת, מציגה את קווי היסוד, את הרכבה ואת חלוקת התפקידים ומבקשת אמון. היא קמה ברגע שהכנסת מביעה בה אמון, ועד אז הממשלה היוצאת ממשיכה לכהן. (' + lawA("gov", "סעיף 13") + ', <a href="' + LAW.lex + '" target="_blank" rel="noopener">לקסיקון הכנסת</a>)</li></ol>' +
    '<p class="small muted">הנוסח נבדק ב-17.10.2026 בנוסח המשולב של החוקים בוויקיטקסט ובלקסיקון באתר הכנסת. הנוסח בוויקיטקסט אינו הפרסום הרשמי ברשומות.</p>' +
    '<h3>מילון קצר</h3><dl class="kdl">' +
      '<dt>גוש</dt><dd>כינוי לקבוצת רשימות שפועלות יחד או מתכוונות להמליץ על אותו מועמד. זה לא מונח בחוק, והגבולות שלו משתנים. הכלי לא משייך רשימות לגושים.</dd>' +
      '<dt>אחוז החסימה</dt><dd>3.25% מהקולות הכשרים. רשימה שלא הגיעה אליו לא מקבלת מושב. 3.25% מ-120 הם 3.9 מושבים, ולכן בכלי אפשר להזין 0 או 4 ומעלה, ולא 1 עד 3. זה פישוט: החלוקה המדויקת תלויה בכל הקולות.</dd>' +
      '<dt>הסכם עודפים</dt><dd>שתי רשימות שנספרות כרשימה אחת רק בחלוקת המושבים שנשארו אחרי החלוקה הראשונה. זה לא הסכם לשבת יחד בממשלה.</dd>' +
      '<dt>קואליציה ואופוזיציה</dt><dd>הקואליציה היא הרשימות שחברות בממשלה ותומכות בה בכנסת. האופוזיציה היא כל השאר.</dd>' +
      '<dt>תמיכה מבחוץ</dt><dd>רשימה שלא חברה בממשלה ולא מקבלת בה תפקידים, אבל מצביעה בעדה או נמנעת כדי שתקום או תשרוד.</dd>' +
      '<dt>ממשלת מיעוט</dt><dd>ממשלה שלקואליציה שלה יש פחות מ-61 מושבים. ' + lawA("gov", "חוק-יסוד: הממשלה") + ' לא קובע רוב מיוחד להצבעת האמון, ו' + lawA("knesset", "חוק-יסוד: הכנסת") + ' (סעיף 25) קובע שהכנסת מחליטה ברוב המשתתפים בהצבעה, בלי הנמנעים. מכאן שממשלה יכולה לקום גם בלי 61 תומכים. זו קריאה שלנו של שני הסעיפים יחד.</dd>' +
      '<dt>רוטציה וראש ממשלה חליפי</dt><dd>ב-2020 נוסף לחוק מנגנון "ממשלת חילופים": שני חברי כנסת מכהנים כראש הממשלה בזה אחר זה, והשני מכהן בינתיים כראש ממשלה חליפי. לפי נוסח החוק, הסעיפים האלה יבוטלו מתחילת כהונת הכנסת ה-26, הכנסת שנבחרת עכשיו. (' + lawA("gov", "חוק-יסוד: הממשלה, סעיף 13א") + ')</dd>' +
      '<dt>הצבעת אמון</dt><dd>ההצבעה שבה הכנסת מאשרת ממשלה חדשה. כדי להחליף ממשלה מכהנת, רוב חברי הכנסת (61) צריכים להביע אמון בממשלה אחרת. (' + lawA("gov", "סעיף 28") + ')</dd></dl>' +
    '<h3>הרשימות: מי הן ועם מי אמרו שישבו</h3><p class="small muted">הכלי לא מתאר רשימות במילים כמו "ימין" או "שמאל". כל משפט על עמדה מקושר למקור.</p>' +
    K.lists.map(cardHTML).join("") +
    '<p class="small muted">הצהרות ונתונים מקובץ הנתונים של המאגר "מה אמרו, ומה עשו" (נבנה ב-' + K.srcBuilt + ', טביעת SHA-256 של הקובץ: <span dir="ltr">' + K.srcSha.slice(0, 16) + '…</span>). הצהרות שסומנו "לא מהמאגר" נבדקו במקור הראשוני. פרטים בלשונית "שיטה ומקורות".</p></section>';
};

view.addEventListener("click", function(e){
  var t = e.target.closest("button"); if (!t || current !== "coalition") return;
  var id = t.dataset.kid;
  if (t.dataset.kstep){ var v = kStep(KS, id, parseInt(t.dataset.kstep, 10)); kSave(); rerender(); announce(KL[id].sn + ": " + v + " מנדטים. " + liveLine()); return; }
  if (t.dataset.kscen){
    var sc = K.scen.filter(function(x){ return x.id === t.dataset.kscen; })[0];
    KIDS.forEach(function(x){ KS.st[x] = sc.lists.indexOf(x) >= 0 ? "in" : "out"; }); KS.pm = sc.pm || null; kSave(); rerender(); announce("נטען התרחיש: " + sc.t + ". " + liveLine()); return;
  }
  var a = t.dataset.kact;
  if (a === "rescale"){ if (kRescale(KS)){ kSave(); rerender(); announce("המנדטים הותאמו ל-120. " + liveLine()); } }
  else if (a === "back"){ if (kBack(KS)){ kSave(); rerender(); announce("המנדטים חזרו לחציון הסקרים. " + liveLine()); } }
  else if (a === "clear"){ kClear(KS); kSave(); rerender(); announce("התרחיש נוקה."); }
  else if (a === "copy") copyScenario();
});
view.addEventListener("change", function(e){
  if (current !== "coalition") return;
  var t = e.target, id = t.dataset.kid;
  if (t.dataset.kst){ KS.st[id] = t.dataset.kst; if (KS.pm && KS.st[KS.pm] !== "in") KS.pm = null; kSave(); rerender(); var cf = kConflicts(KS); announce(KL[id].sn + ": " + STN[t.dataset.kst] + ". " + liveLine() + (t.dataset.kst === "in" ? " התנגשויות בצירוף: " + (cf.hard.length + cf.cond.length) + "." : "")); return; }
  if (t.dataset.kseat){
    var r = kSetSeat(KS, t.dataset.kseat, t.value);
    if (!r.ok){ var er = document.getElementById("ke-" + t.dataset.kseat); if (er) er.textContent = r.msg; t.value = KS.seats[t.dataset.kseat]; t.setAttribute("aria-invalid", "true"); return; }
    kSave(); rerender(); announce(liveLine()); return;
  }
  if (t.dataset.kpm){ KS.pm = t.value || null; kSave(); rerender(); return; }
  if (t.dataset.ksel){ KS.sel = t.value; kSave(); rerender(); return; }
});
view.addEventListener("keydown", function(e){ if (current === "coalition" && e.key === "Enter" && e.target.dataset && e.target.dataset.kseat){ e.target.blur(); } });
function liveLine(){ var sm = kSums(KS); return "בקואליציה " + sm.coal + " מתוך 61. סך הכול " + sm.total + " מתוך 120."; }
