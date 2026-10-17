/* Render tests for the built site: every tab in every project (2 viewports x 2 color schemes),
   plus coalition, ban-mode and quiz flows that run once (390 light). */
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const TABS = ["home", "parties", "matrix", "coalition", "tools", "decide", "method"] as const;
const PRE = new Date("2026-10-18T12:00:00+03:00");
const BAN = new Date("2026-10-25T12:00:00+03:00");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Collects console errors, page errors, failed responses and requests to other hosts. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => problems.push("requestfailed: " + r.url()));
  page.on("response", (r) => { if (r.status() >= 400) problems.push("http " + r.status() + ": " + r.url()); });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol === "data:" || u.protocol === "blob:") return;
    if (!LOCAL_HOSTS.has(u.hostname)) problems.push("third-party request: " + r.url());
  });
  return problems;
}

async function openTab(page: Page, tab: string): Promise<void> {
  await page.locator(`nav.tabs button[data-view="${tab}"]`).click();
  await expect(page.locator(`nav.tabs button[data-view="${tab}"]`)).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#view :is(h1, h2)").first()).toBeVisible();
}

async function load(page: Page, hash = ""): Promise<void> {
  await page.goto("/" + hash);
  await expect(page.locator("#view :is(h1, h2)").first()).toBeVisible();
}

const only390Light = (info: TestInfo) => test.skip(info.project.name !== "390-light", "flow runs once, in 390 light");

for (const tab of TABS) {
  test(`tab ${tab}: no overflow, errors, failed or third-party requests, cookies`, async ({ page, context }) => {
    const problems = watch(page);
    await load(page);
    await openTab(page, tab);
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(sw, "horizontal page overflow").toBeLessThanOrEqual(iw);
    expect(await page.evaluate(() => document.cookie)).toBe("");
    expect(await context.cookies()).toEqual([]);
    expect(problems).toEqual([]);
  });

  test(`tab ${tab}: tap targets are at least 44x44`, async ({ page }, info) => {
    await load(page);
    await openTab(page, tab);
    const r = await page.evaluate(() => {
      const MIN = 44;
      const exempt: Record<string, number> = {};
      const violations: string[] = [];
      const ex = (k: string) => { exempt[k] = (exempt[k] || 0) + 1; };
      const visible = (b: DOMRect, e: Element) => b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden";
      const blockParent = (e: Element): Element | null => {
        let p = e.parentElement;
        while (p && getComputedStyle(p).display === "inline") p = p.parentElement;
        return p;
      };
      const els = document.querySelectorAll<HTMLElement>("#view button, #view a, #view input, #view select, nav button, nav a");
      els.forEach((el) => {
        let box = el.getBoundingClientRect();
        if (!visible(box, el)) return;
        const input = el as HTMLInputElement;
        /* A radio or checkbox wrapped in its label: the label is the tap target, so measure it. */
        if (el.tagName === "INPUT" && (input.type === "radio" || input.type === "checkbox") && el.closest("label")) {
          box = el.closest("label")!.getBoundingClientRect();
        }
        if (box.width >= MIN && box.height >= MIN) return;
        const cs = getComputedStyle(el), bp = blockParent(el);
        /* v5 exceptions, kept as found in the v5 artifact (lifnei-hakalpi.html), not fixed here:
           1. Inline links in running text (p, li). WCAG 2.5.8 exempts inline targets in a sentence.
           2. The same inline links in v5 text blocks that are not p/li: the party-card lines
              (span.td, span.pc), statement stages (div.stages), notes (div.note) and glossary (dd).
           3. The tab bar: v5 sets nav.tabs button min-height 40px (renders 42px). Must stay >= 40.
           4. Position pills in the matrix (a.v inside div.pair, 22px tall in v5).
           5. Tool titles on the tools tab (a.tt, a bold heading link, 26px tall in v5). */
        if (el.tagName === "A" && cs.display === "inline" && bp && (bp.tagName === "P" || bp.tagName === "LI")) return ex("inline a in p/li");
        if (el.tagName === "A" && cs.display === "inline" && bp && (bp.tagName === "DD" || bp.matches(".td, .pc, .stages, .note"))) return ex("inline a in other v5 text");
        if (el.matches("nav.tabs button") && box.height >= 40) return ex("nav.tabs button (v5 40px)");
        if (el.matches(".pair > a.v")) return ex("matrix a.v pill");
        if (el.matches(".tool > a.tt")) return ex("tools a.tt title");
        violations.push(el.tagName.toLowerCase() + (el.className ? "." + el.className : "") + " " + Math.round(box.width) + "x" + Math.round(box.height) + " '" + (el.textContent || "").trim().slice(0, 30) + "'");
      });
      return { exempt, violations };
    });
    for (const [k, n] of Object.entries(r.exempt)) info.annotations.push({ type: "tap-exempt", description: `${tab}: ${k} = ${n}` });
    console.log(`[${info.project.name}] ${tab} exempt ${JSON.stringify(r.exempt)}`);
    expect(r.violations).toEqual([]);
  });
}

/** Every input, select and textarea in #view has a name from a label, aria-label or aria-labelledby. */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const txt = (s: string | null | undefined) => (s || "").trim();
    const out: string[] = [];
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("#view input, #view select, #view textarea").forEach((el) => {
      if (txt(el.getAttribute("aria-label"))) return;
      const ids = txt(el.getAttribute("aria-labelledby")).split(/\s+/).filter(Boolean);
      if (ids.some((id) => txt(document.getElementById(id)?.textContent))) return;
      if (Array.from(el.labels || []).some((l) => txt(l.textContent))) return;
      out.push(el.tagName.toLowerCase() + "#" + el.id + " " + el.outerHTML.slice(0, 80));
    });
    return out;
  });
}

test("coalition and quiz controls have accessible names", async ({ page }) => {
  await load(page, "#coalition");
  await page.locator('[data-kscen="pm-netanyahu"]').click();   // fills the PM select with options
  expect(await page.locator("#view input, #view select").count()).toBeGreaterThan(0);
  expect(await unnamedControls(page)).toEqual([]);
  /* Long quiz: the red-line checkbox on each statement and the textareas of the reflection step. */
  await openTab(page, "home");
  await page.locator('[data-act="start-long"]').click();
  await expect(page.locator("#view [data-red]")).toHaveCount(1);
  expect(await unnamedControls(page)).toEqual([]);
  for (let i = 0; i < 50 && (await page.locator("#view textarea").count()) === 0; i++) {
    await page.locator('#view [data-ans="none"]').click();
    await page.locator('#view [data-act="next"]').click();
  }
  expect(await page.locator("#view textarea").count()).toBeGreaterThan(0);
  expect(await unnamedControls(page)).toEqual([]);
});

test("dark mode changes the body background", async ({ page }, info) => {
  await load(page);
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const scheme = info.project.use.colorScheme as "light" | "dark";
  expect(await page.evaluate((s) => matchMedia(`(prefers-color-scheme: ${s})`).matches, scheme)).toBe(true);
  const mine = await bg();
  await page.emulateMedia({ colorScheme: scheme === "light" ? "dark" : "light" });
  expect(await bg()).not.toBe(mine);
});

const conflictItems = (page: Page) => page.locator("#k-conf .clist.hard > li, #k-conf .clist.cond > li");

test("coalition: ready scenarios and the v5 conflict combination", async ({ page }, info) => {
  only390Light(info);
  await load(page, "#coalition");
  /* v5 (lifnei-hakalpi.html) gives 0 conflicts for each of the three ready scenarios. */
  const scen = page.locator("[data-kscen]");
  const n = await scen.count();
  expect(n).toBe(3);
  for (let i = 0; i < n; i++) {
    await scen.nth(i).click();
    await expect(page.locator("#live")).toContainText("נטען התרחיש");
    await expect(conflictItems(page)).toHaveCount(0);
    await expect(page.locator("#k-conf")).toContainText("לא נמצאה בצירוף הזה הצהרה מתועדת");
  }
  /* The conflict case from shot_coal.py: Likud, Democrats, Shas in, Ra'am outside support, Netanyahu PM. v5 gives 3. */
  await page.locator('[data-kact="clear"]').click();
  for (const id of ["likud", "hademokratim", "shas"]) await page.locator(`label:has(> input[data-kst=in][data-kid=${id}])`).click();
  await page.locator("label:has(> input[data-kst=sup][data-kid=raam])").click();
  await page.locator("select[data-kpm]").selectOption("likud");
  await expect(conflictItems(page)).toHaveCount(3);
  await expect(page.locator("#k-conf")).toContainText("3 הצהרות מתועדות סותרות את הצירוף");
});

test("coalition: seat threshold message and live counter", async ({ page }, info) => {
  only390Light(info);
  await page.clock.install({ time: PRE });
  await load(page, "#coalition");
  const seat = page.locator("#ks-noam");
  const before = await seat.inputValue();
  await seat.fill("3");
  await seat.press("Enter");
  await expect(page.locator("#ke-noam")).toContainText("מקבלת לפחות 4 מנדטים");
  await expect(seat).toHaveValue(before);
  await expect(seat).toHaveAttribute("aria-invalid", "true");

  const total = async () => Number(await page.locator("#k-count .knums > span").last().locator("b").innerText());
  const t0 = await total();
  await page.locator("#ks-noam").fill("10");
  await page.locator("#ks-noam").press("Enter");
  const t1 = t0 - Number(before) + 10;
  await expect(page.locator("#k-count .knums > span").last().locator("b")).toHaveText(String(t1));
  await expect(page.locator("#live")).toHaveText(new RegExp("^בקואליציה \\d+ מתוך 61\\. סך הכול " + t1 + " מתוך 120\\.$"));
});

test("ban mode hides polls and marks old polls; absent before the ban", async ({ page }, info) => {
  only390Light(info);
  await page.clock.install({ time: BAN });
  await load(page, "#coalition");
  await expect(page.locator("#view")).not.toContainText("חציון");
  await openTab(page, "parties");
  await expect(page.locator("#view .banner")).toContainText("תקופת איסור פרסום סקרים");
  await expect(page.locator("#view")).toContainText("פורסם לפני תקופת איסור הפרסום");
});

test("before the ban: polls shown, no ban notice", async ({ page }, info) => {
  only390Light(info);
  await page.clock.install({ time: PRE });
  await load(page, "#coalition");
  await expect(page.locator("#view")).toContainText("חציון");
  await openTab(page, "parties");
  await expect(page.locator("#view :is(h1, h2)").first()).toBeVisible();
  await expect(page.locator("#view")).not.toContainText("תקופת איסור פרסום סקרים");
  await expect(page.locator("#view")).not.toContainText("פורסם לפני תקופת איסור הפרסום");
});

test("quiz: short track to results, kept after reload", async ({ page }, info) => {
  only390Light(info);
  await load(page);
  await page.locator('[data-act="start-short"]').click();
  const stepLabel = page.locator("#view .navrow .small.muted").first();
  await expect(stepLabel).toContainText("שלב 1 מתוך 11");
  for (let i = 0; i < 10; i++) {
    await page.locator('#view .qbtns [data-ans="1.5"]').click();
    await expect(stepLabel).toContainText("שלב " + (i + 2) + " מתוך 11");
  }
  await page.locator('#view [data-act="finish"]').click();
  await expect(page.locator("#h-res")).toBeVisible();
  const rows = page.locator("#view .party .rank");
  const n = await rows.count();
  expect(n).toBeGreaterThan(1);
  await expect(rows.first()).toHaveText("1");
  await page.reload();
  await expect(page.locator("#h-res")).toBeVisible();
  await expect(page.locator("#view .party .rank")).toHaveCount(n);
});
