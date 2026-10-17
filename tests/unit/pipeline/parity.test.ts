import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { built, diff, json, REPO } from "./helpers.ts";

describe("parity with v5", () => {
  it("coalition equals v5 coal.json in every field (scen srcRule is the only addition)", () => {
    const v5 = json(join(REPO, "tests/fixtures/coal-v5.json"));
    const ours = structuredClone(built().site.coalition);
    for (const s of ours.scen) {
      expect(s.srcRule).toBeTruthy();
      delete s.srcRule;
    }
    expect(diff(ours, v5)).toEqual([]);
  });
  it("quiz keeps the v5 shape; questions, short and cell counts match", () => {
    const v5 = json(join(REPO, "tests/fixtures/quiz-v5.json"));
    const q = built().site.quiz;
    expect(q.questions.map(({ issue: _i, ...x }: { issue: unknown }) => x)).toEqual(v5.questions);
    expect(q.short).toEqual(v5.short);
    expect(q.parties.map((p: { id: string }) => p.id)).toEqual(v5.parties.map((p: { id: string }) => p.id));
    expect(q.parties.map((p: { th: unknown }) => p.th)).toEqual(v5.parties.map((p: { th: unknown }) => p.th));
    expect(Object.keys(q.cats)).toEqual(["law", "draft", "religion", "security", "war", "account", "edu", "coalition", "rights"]);
  });
});
