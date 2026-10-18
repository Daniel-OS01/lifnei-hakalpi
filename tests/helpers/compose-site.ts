/* Test helper: the v5 artifact's data in the site.json shape, with this repo's election.json and content
   files merged in by the pipeline's own rule (scripts/build-data.ts buildContent). View parity tests use it
   so they compare code against v5 on v5's data (lists[].k25 renamed to prevFaction); the snapshot-built site.json is tested in tests/unit/pipeline. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildContent } from "../../scripts/build-data";
import type { SiteData } from "../../src/types";

const ROOT = process.cwd();

export function composeContent(electionId: string): Record<string, unknown> {
  return buildContent(ROOT, electionId);
}

/** A fresh copy each call, so tests cannot leak state into each other. */
export function v5Site(electionId = "2026-knesset-26"): SiteData {
  const site = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/site-v5-artifact.json"), "utf8"));
  // v5 named the previous-Knesset faction k25; the site.json shape calls it prevFaction.
  for (const l of site.coalition.lists) { l.prevFaction = l.k25; delete l.k25; }
  site.election = JSON.parse(readFileSync(join(ROOT, "data/elections", electionId, "election.json"), "utf8"));
  site.content = composeContent(electionId);
  return site as SiteData;
}
