// Weekly link check. Collects every http(s) URL in public/data/elections/*/site.json,
// checks them and writes link-report.md. Always exits 0: dead links are a report, not a failure.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type LinkClass = "alive" | "blocked" | "dead";
export interface LinkResult {
  url: string;
  status: number | null;
  cls: LinkClass;
  error?: string;
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const URL_RE = /https?:\/\/[^\s"'<>\\)\]]+/g;

export function collectUrls(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    for (const m of value.match(URL_RE) ?? []) out.add(m.replace(/[.,;:!?]+$/, ""));
  } else if (Array.isArray(value)) {
    for (const v of value) collectUrls(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectUrls(v, out);
  }
  return out;
}

export function classify(status: number | null): LinkClass {
  if (status === null) return "dead";
  if (status >= 200 && status < 400) return "alive";
  if (status === 401 || status === 403 || status === 429) return "blocked";
  return "dead";
}

async function attempt(url: string, method: "HEAD" | "GET", timeoutMs: number): Promise<number> {
  const res = await fetch(url, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": UA, accept: "text/html,*/*;q=0.8", "accept-language": "he,en;q=0.8" },
  });
  await res.body?.cancel().catch(() => undefined);
  return res.status;
}

export async function checkUrl(url: string, timeoutMs = 15000): Promise<LinkResult> {
  let status: number | null = null;
  let error: string | undefined;
  try {
    status = await attempt(url, "HEAD", timeoutMs);
    if (classify(status) !== "alive") status = await attempt(url, "GET", timeoutMs);
  } catch (e) {
    try {
      status = await attempt(url, "GET", timeoutMs);
    } catch (e2) {
      status = null;
      error = (e2 as Error).name === "TimeoutError" ? "timeout" : String((e2 as Error).cause ?? (e2 as Error).message ?? e);
    }
  }
  return { url, status, cls: classify(status), ...(error ? { error } : {}) };
}

export async function checkAll(urls: string[], concurrency = 8, timeoutMs = 15000): Promise<LinkResult[]> {
  const results: LinkResult[] = new Array(urls.length);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      results[i] = await checkUrl(urls[i]!, timeoutMs);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return results;
}

export function renderReport(results: LinkResult[], when = new Date()): string {
  const by = (c: LinkClass) => results.filter((r) => r.cls === c);
  const row = (r: LinkResult) => `- ${r.url} (${r.status ?? r.error ?? "אין תגובה"})`;
  const lines = [
    "# דוח קישורים שבורים",
    "",
    `נבדק ב-${when.toISOString().slice(0, 10)}. סך הכל ${results.length} קישורים ייחודיים.`,
    "",
    `- תקינים: ${by("alive").length}`,
    `- חסומים לבוט, לא בהכרח שבורים (401, 403, 429): ${by("blocked").length}`,
    `- שבורים: ${by("dead").length}`,
    "",
    "## שבורים",
    "",
    ...(by("dead").length ? by("dead").map(row) : ["אין."]),
    "",
    "## חסומים לבדיקה אוטומטית",
    "",
    ...(by("blocked").length ? by("blocked").map(row) : ["אין."]),
    "",
  ];
  return lines.join("\n");
}

export function collectFromSiteFiles(root = "public/data/elections"): string[] {
  const urls = new Set<string>();
  if (!existsSync(root)) return [];
  for (const id of readdirSync(root)) {
    const f = join(root, id, "site.json");
    if (existsSync(f)) collectUrls(JSON.parse(readFileSync(f, "utf8")), urls);
  }
  return [...urls].sort();
}

async function main(): Promise<void> {
  const urls = collectFromSiteFiles();
  console.log(`link-check: ${urls.length} unique URLs`);
  const results = await checkAll(urls);
  writeFileSync("link-report.md", renderReport(results));
  const dead = results.filter((r) => r.cls === "dead").length;
  console.log(`link-check: ${dead} dead, report written to link-report.md`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error("link-check failed unexpectedly:", e);
    writeFileSync("link-report.md", "# דוח קישורים שבורים\n\nהבדיקה עצמה נכשלה, ראו את הלוג של הריצה.\n");
  }).finally(() => process.exit(0));
}
