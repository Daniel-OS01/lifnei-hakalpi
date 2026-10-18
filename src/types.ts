/* Shared contract between the data pipeline (site.json) and the app modules.
   Every election-specific value reaches the app through these types; src/ holds no election data. */

export interface Election {
  id: string; kind: string; knessetNumber: number; nameHe: string; dateIso: string; dayHe: string;
  pollsOpen: string; pollsClose: string; timezone: string;
  thresholdPct: number; totalSeats: number; majority: number; minSeatsIfPassed: number;
  pollBan: { from: string; until: string; lawRef: string; lawUrl: string; sourceNote?: string };
  pollingInfo: { lookupUrl: string; phones: string[]; sms: string; registerClosed: string };
  source: { nameHe: string; author: string; baseUrl: string; dataUrl: string; evidencePath: string; listPath: string; pollsPath: string; issuePath: string };
  snapshot: string; listsAllApprovedUrl?: string; listsAllApprovedCount?: number;
}

/** v5 quiz cell, documented in docs/architecture.md */
export interface Cell {
  s: number | null; a: number | null; sl?: 1; al?: 1; si?: 1; ai?: 1; sx?: string; ax?: string;
  g?: 1; su: string; au: string; sd?: string; ad?: string;
}
export interface Question { id: string; cat: string; title: string; label: string; stmt: string; issue?: string | null; sourceQuestionId?: string }
export interface Category { t: string; a: string; b: string | null }
export interface QuizParty {
  id: string; n: string; l: string; letters: string; th: "near" | "below" | null; cand: string; site: string | null; top: string[];
  seats: { median: number; low: number; high: number; n: number; from: string; to: string };
  below: string[]; conduct: { total: number; parts: [string, number][] }; legal: string; documented: number;
  cov: Record<string, string>; pl: string | null; pt: string; src?: string;
}
export interface QuizData {
  base: string; asof: string; srcBuilt: string; questions: Question[]; short: string[];
  parties: QuizParty[]; cells: Record<string, Cell[]>; cats: Record<string, Category>;
}

/** v5 coal.json shape; fields are documented in data/elections/<id>/coalition and docs/data-model.md */
export type Level = "X" | "C" | "N" | "O" | "P";
export interface Src { u?: string; e?: string; o?: string; x?: 1 }
export interface Stage { lv: Level; d: string; t: string; cond?: string | null; s: Src[] }
export interface Statement { a: string; b?: string; h?: string; lv: Level; d: string; t: string; cond?: string | null; s: Src[]; db?: { q: string; v: number | null; c?: string | null; im?: boolean } | null; gen?: boolean; rep?: boolean; st: Stage[] }
export interface CoalList {
  id: string; n: string; sn: string; l: string; lead: string; cp: string[]; prevFaction: string[] | null;
  med: number; lo: number; hi: number; pn: number; pf: string; pt: string; outlets: string; bt: unknown[];
  gov: { t: string; s: Src[] }; cond: { t: string; s: Src[] } | null; nu: { t: string; s: Src[] }[]; gaps: string[];
}
export interface Scenario { id: string; t: string; lists: string[]; pm: string | null; why: string; srcRule?: { pmHead?: string; lv?: Level; cell?: [string, string] } }
export interface CoalData {
  asof: string; srcBuilt: string; srcVer: string; srcSha: string; base: string; issue: string; polls: string;
  ban: { f: string; u: string }; lists: CoalList[]; start: Record<string, number>; cells: Statement[]; pm: Statement[];
  out: Record<string, { lv: Level; t: string; s: Src[]; v: number | null; c: string | null; im: boolean }>;
  arab: string[]; qt: Record<string, string>; cq: Record<string, Record<string, Record<string, unknown>>>;
  surplus: { a: string; b: string; d: string; s: Src[] }[]; surplusNone: { lists: string[]; t: string; s: Src[] }; scen: Scenario[];
}

export interface ChangelogEntry { version: string; date: string; items: string[] }
/** content keys: every data/elections/<id>/content/*.json by file name, *.md as <camelName>Html,
    docs/method.md as methodHtml, data/common/*.json by file name, changelog from CHANGELOG.md */
export type Content = Record<string, any> & { changelog: ChangelogEntry[] };

export interface SiteData {
  schemaVersion: 2;
  build: { builtAt: string; siteVersion: string; snapshot: { date: string; sha256: string; sourceBuiltAt: string } };
  election: Election; quiz: QuizData; coalition: CoalData; content: Content;
}

/** What every view receives. now is injected (ms since epoch) so tests control time. */
export interface Ctx { site: SiteData; now: number; electionIds: string[]; siteVersion: string }

/** What main.ts gives each module to drive the page. */
export interface Api {
  show(view: string, keepScroll?: boolean): void;
  rerender(): void;
  announce(text: string): void;
  toast(text: string): void;
  current(): string;
}

/** A view module: views render HTML strings (no DOM access); bind attaches event handlers once. */
export interface ViewModule {
  views: Record<string, (ctx: Ctx) => string>;
  bind?(root: HTMLElement, ctx: () => Ctx, api: Api): void;
}
