import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { inBan, daysToElection, phase, afterElection } from "../../../src/time";
const E = JSON.parse(readFileSync("data/elections/2026-knesset-26/election.json", "utf8"));
const t = (s: string) => Date.parse(s);
describe("time module", () => {
  it("ban window edges", () => {
    expect(inBan(t("2026-10-23T23:59:00+03:00"), E)).toBe(false);
    expect(inBan(t("2026-10-24T00:00:00+03:00"), E)).toBe(true);
    expect(inBan(t("2026-10-27T21:59:00+02:00"), E)).toBe(true);
    expect(inBan(t("2026-10-27T22:00:00+02:00"), E)).toBe(false);
  });
  it("countdown counts calendar days in the election's time zone", () => {
    expect(daysToElection(t("2026-10-18T12:00:00+03:00"), E)).toBe(9);
    expect(daysToElection(t("2026-10-18T06:00:00+03:00"), E)).toBe(9);
    expect(daysToElection(t("2026-10-18T23:30:00+03:00"), E)).toBe(9);
    expect(daysToElection(t("2026-10-26T12:00:00+02:00"), E)).toBe(1);
    expect(daysToElection(t("2026-10-26T23:59:00+02:00"), E)).toBe(1);
    expect(daysToElection(t("2026-10-27T06:00:00+02:00"), E)).toBe(0);
    expect(daysToElection(t("2026-10-27T08:00:00+02:00"), E) === 0).toBe(true);
  });
  it("phases", () => {
    expect(phase(t("2026-10-18T12:00:00+03:00"), E)).toBe("before");
    expect(phase(t("2026-10-25T12:00:00+02:00"), E)).toBe("ban");
    expect(phase(t("2026-10-27T12:00:00+02:00"), E)).toBe("electionDay");
    expect(phase(t("2026-10-28T12:00:00+02:00"), E)).toBe("after");
    expect(afterElection(t("2026-10-27T06:59:00+02:00"), E)).toBe(false);
  });
});
