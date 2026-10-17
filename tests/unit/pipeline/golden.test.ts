import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assessments, coalChunk, conductCounts, encodeCell, metaChunk, partyMeta, sha256Trim } from "../../../scripts/lib/pipeline.ts";
import { built, G16, G17, json } from "./helpers.ts";

// Hashes from the v5 build_coal.py H (computed on the browser side, trailing newlines trimmed).
const H = {
  "meta.json": "2fc53b52c1fa19dc02b6568c8b5e698d3314b1f5a2f3a403eafe50c5b48a451b",
  "coal.txt": "ee0cb1ac81e4ffdb68c87858d41e6171db33189ccb155df1b0c39a01c9ae565f",
  "claims.json": "ebda84bf116617091c82e3c37a676e6673d9bb0a81705926c2b4dd33e395879a",
};

/** Our metaChunk with the faction key renamed, in place, to the golden file's v5 name k25. */
const asGolden = (rows: Record<string, unknown>[]) =>
  rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k === "prevFaction" ? "k25" : k, v])));
const prevField = () => built().site.election.source.fields.prevFaction as string;

describe("golden 17.10 browser chunks", () => {
  it("golden files carry the verified hashes", () => {
    for (const [f, h] of Object.entries(H)) expect(sha256Trim(readFileSync(join(G17, f), "utf8"))).toBe(h);
  });
  it("meta.json is reproduced byte for byte", () => {
    expect(sha256Trim(JSON.stringify(asGolden(metaChunk(built().snap.data, prevField()))))).toBe(H["meta.json"]);
  });
  it("metaChunk refuses a source.fields.prevFaction that the parties do not have", () => {
    expect(() => metaChunk(built().snap.data, "no_such_field")).toThrow(/has no field no_such_field \(election\.json source\.fields\.prevFaction\)$/);
  });
  it("coal.txt is reproduced byte for byte", () => {
    expect(sha256Trim(coalChunk(built().snap.data))).toBe(H["coal.txt"]);
  });
  it("claims.json entries are reproduced exactly from the evidence index", () => {
    const golden = json(join(G17, "claims.json"));
    const idx = built().ev.index;
    const ours = Object.fromEntries(Object.keys(golden).map((k) => [k, idx[k]]));
    expect(ours).toEqual(golden);
    expect(sha256Trim(JSON.stringify(ours))).toBe(H["claims.json"]);
  });
});

describe("re-encoding against out1.json (16.10)", () => {
  const out1 = json(join(G16, "out1.json"));
  const qs: { sourceQuestionId: string }[] = json(join(G17, "../../../content/questions.json")).questions;
  it("differs in exactly the 3 known cells", () => {
    const data = built().snap.data;
    const A = assessments(data);
    const diffs: string[] = [];
    for (const pid of Object.keys(out1.V))
      qs.forEach((q, k) => {
        const mine = encodeCell(A.get(`${pid}|${q.sourceQuestionId}|stated`), A.get(`${pid}|${q.sourceQuestionId}|actual`));
        if (mine !== out1.V[pid][k]) diffs.push(`${pid} ${q.sourceQuestionId}: ${out1.V[pid][k]} -> ${mine}`);
      });
    // stated value 1 -> 2 and as-of for hademokratim; stated as-of 15.10 -> 16.10 for yisrael-beiteinu (twice)
    expect(diffs).toEqual([
      "hademokratim q-gender-segregation: 1|l|0||16.7.2026~2|h|0||16.7.2026 -> 2|l|0||16.10.2026~2|h|0||16.7.2026",
      "yisrael-beiteinu q-raam-coalition: -2|h|0||15.10.2026~2|h|0|| -> -2|h|0||16.10.2026~2|h|0||",
      "yisrael-beiteinu q-arab-parties-outside-support: -2|h|0||15.10.2026~||0|nf| -> -2|h|0||16.10.2026~||0|nf|",
    ]);
    expect(diffs).toHaveLength(3);
  });
  it("party meta computed from the snapshot keeps out1 cov and conduct kinds", () => {
    const data = built().snap.data;
    for (const pid of Object.keys(out1.M)) {
      const m = partyMeta(data, pid);
      expect(Object.keys(m.cc).every((k) => ["falsehood", "conspiracy", "attack"].includes(k))).toBe(true);
      expect(Object.keys(m.cov)).toEqual(Object.keys(out1.M[pid].cov));
    }
  });
  it("conduct counts include only events classified as counted", () => {
    const ev = (classification: string) => ({ subject: { id: "p" }, kind: "attack", classification });
    expect(conductCounts({ people: [], conductEvents: [ev("counted"), ev("excluded")] }, "p")).toEqual({ attack: 1 });
  });
});
