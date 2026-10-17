/* Mutation proof: breaks the code each unit test guards, one mutation at a time, and checks the suite notices.
   Each mutation replaces one exact source string (which must occur exactly once in its file), runs the unit
   suite, then restores the original bytes. Prints CAUGHT or MISSED per mutation; exits 1 on any MISSED.
   Usage: npm run mutate */
import { readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

interface Mutation { name: string; file: string; from: string; to: string }

const LOGIC = "src/coalition/logic.ts", STATE = "src/coalition/state.ts", SHELL = "src/views/shell.ts";
const SCORE = "src/quiz/score.ts", TIME = "src/time.ts", PIPE = "scripts/lib/pipeline.ts";
const TIMEOUT_MS = 180_000;

const M: Mutation[] = [
  // the v5 coalition mutations (mutate.py), ported to the TS sources
  { name: "sum of the coalition", file: LOGIC, from: "r.coal += v; r.nIn++;", to: "r.coal += v - (v ? 1 : 0); r.nIn++;" },
  { name: "total sum", file: LOGIC, from: "r.total += v;", to: "r.total += v + 1;" },
  { name: "threshold in typed values", file: LOGIC, from: "if (v >= 1 && v < E.minSeatsIfPassed) return { ok: false", to: "if (false) return { ok: false" },
  { name: "threshold in validSeat", file: LOGIC, from: "(v === 0 || (v >= E.minSeatsIfPassed && v <= E.totalSeats))", to: "(v >= 0 && v <= E.totalSeats)" },
  { name: "threshold in the plus button", file: LOGIC, from: "v = v === 0 ? E.minSeatsIfPassed : Math.min(E.totalSeats, v + 1);", to: "v = v === 0 ? 1 : Math.min(E.totalSeats, v + 1);" },
  { name: "threshold in rescale", file: LOGIC, from: "while (base[id] >= 1 && base[id] < M) {", to: "while (false) {" },
  { name: "conflicts: one direction only", file: LOGIC, from: 'if (c.lv === "X") hard.push({ k: "pair"', to: 'if (c.lv === "X" && a < b) hard.push({ k: "pair"' },
  { name: "conflicts: conditional merged into info", file: LOGIC, from: 'else if (c.lv === "C") cond.push({ k: "pair"', to: 'else if (c.lv === "C") info.push({ k: "pair"' },
  { name: "conflicts: outside support checked against seating", file: LOGIC, from: "const o = K.out[a]; if (!o) return;", to: "const o = cellOf(K, a, b) || K.out[a]; if (!o) return;" },
  { name: "conflicts: PM ignored", file: LOGIC, from: "if (pm === h) (p.lv", to: "if (false) (p.lv" },
  { name: "save", file: STATE, from: "localStorage.setItem(stateKey(electionId), JSON.stringify(s))", to: 'localStorage.setItem(stateKey(electionId) + "x", JSON.stringify(s))' },
  { name: "load ignores ban", file: LOGIC, from: "if (inBan(now, E) && s.polls) {", to: "if (false) {" },
  { name: "back to polls", file: LOGIC, from: "{ s.seats[id] = K.start[id]; });\n  s.polls = true;", to: "{ s.seats[id] = 0; });\n  s.polls = true;" },
  { name: "back to polls during the ban", file: LOGIC, from: "if (inBan(now, E)) return false;\n", to: "" },
  { name: "start values during the ban", file: LOGIC, from: "s.seats[id] = ban ? 0 : K.start[id];", to: "s.seats[id] = K.start[id];" },
  { name: "legal notice in parties tab", file: SHELL, from: `(ban ? '<div class="banner" role="note">' + fill(P.banNotice, V)`, to: `(false ? '<div class="banner" role="note">' + fill(P.banNotice, V)` },
  // scoring
  { name: "score: low confidence at full weight", file: SCORE, from: "if (pv.low) w = w * 0.5;", to: "if (pv.low) w = w * 1;" },
  { name: "score: similarity over 2 instead of 4", file: SCORE, from: "const a = 1 - Math.abs(u - pv.v) / 4;", to: "const a = 1 - Math.abs(u - pv.v) / 2;" },
  { name: "score: coverage rule disabled", file: SCORE, from: "const thin = answered === 0 || covered / answered < 0.5;", to: "const thin = answered === 0;" },
  { name: "score: red line at 3", file: SCORE, from: "Math.abs(u - pv.v) >= 2.5) reds.push", to: "Math.abs(u - pv.v) >= 3) reds.push" },
  { name: "score: said uses actual values", file: SCORE, from: 'if (basis === "said") return hasS ? { v: c.s as number, low: !!c.sl } : null;', to: 'if (basis === "said") return hasA ? { v: c.a as number, low: !!c.al } : null;' },
  // time
  { name: "time: ban end inclusive", file: TIME, from: "now < Date.parse(e.pollBan.until)", to: "now <= Date.parse(e.pollBan.until)" },
  // pipeline
  { name: "pipeline: classification filter removed", file: PIPE, from: '|| e.classification !== "counted") continue;', to: ") continue;" },
  { name: "pipeline: loadSnapshot hash comparison skipped", file: PIPE, from: "check(got === want, ", to: "check(true, " },
  // repository checks
  { name: "dash ban: U+2014 only", file: "scripts/check-dashes.ts", from: String.raw`const DASH = /[\u2013\u2014\u2015]/;`, to: String.raw`const DASH = /[\u2014]/;` },
  { name: "election-agnostic: ISO date rule removed", file: "scripts/check-election-agnostic.ts", from: String.raw`    ["ISO date", /\b\d{4}-\d{2}-\d{2}\b/],` + "\n", to: "" },
];

// git children must not inherit a hook's GIT_* variables
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
const git = (args: string[]) => spawnSync("git", args, { env: gitEnv, encoding: "utf8" });

const files = [...new Set(M.map((m) => m.file))];
const original = new Map(files.map((f) => [f, readFileSync(f)]));

// fail loudly before touching anything
const problems: string[] = [];
for (const m of M) {
  const n = original.get(m.file)!.toString("utf8").split(m.from).length - 1;
  if (n !== 1) problems.push(`${m.name}: pattern occurs ${n} times in ${m.file}, expected exactly 1`);
}
if (git(["diff", "--quiet", "--", ...files]).status !== 0) problems.push("a mutated file has uncommitted changes; commit or revert it first");
if (problems.length) { problems.forEach((p) => console.error("mutate: " + p)); process.exit(2); }

let current: string | null = null;
function restore(): void {
  if (current) { writeFileSync(current, original.get(current)!); current = null; }
}
let child: ReturnType<typeof spawn> | null = null;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { child?.kill("SIGKILL"); restore(); console.error(`mutate: ${sig}, restored the source`); process.exit(130); });
}

interface Run { ok: boolean; timedOut: boolean; why: string }
function suite(): Promise<Run> {
  return new Promise((done) => {
    let out = "", timedOut = false;
    child = spawn("npx", ["vitest", "run", "--reporter=dot"], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout!.on("data", (b) => { out += b; });
    child.stderr!.on("data", (b) => { out += b; });
    const timer = setTimeout(() => { timedOut = true; child?.kill("SIGKILL"); }, TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer); child = null;
      const why = out.split("\n").map((l) => l.trim()).find((l) => /^(FAIL|×|AssertionError|Error:)/.test(l)) ?? "";
      done({ ok: code === 0 && !timedOut, timedOut, why: why.slice(0, 110) });
    });
  });
}

const t0 = Date.now();
const base = await suite();
if (!base.ok) { console.error("mutate: the unmodified suite does not pass" + (base.why ? ": " + base.why : "")); process.exit(2); }

let missed = 0;
for (const m of M) {
  const src = original.get(m.file)!.toString("utf8");
  let r: Run;
  try {
    current = m.file;
    writeFileSync(m.file, src.replace(m.from, () => m.to));
    r = await suite();
  } finally { restore(); }
  const caught = !r.ok;
  if (!caught) missed++;
  console.log((caught ? "CAUGHT " : "MISSED ") + m.name + (r.timedOut ? "  -> timeout" : r.why ? "  -> " + r.why : ""));
}

const dirty = files.filter((f) => !readFileSync(f).equals(original.get(f)!));
const clean = git(["diff", "--quiet", "--", ...files]).status === 0;
console.log(`${M.length - missed}/${M.length} caught, ${missed} missed, ${Math.round((Date.now() - t0) / 1000)}s`);
if (dirty.length || !clean) { console.error("mutate: working tree differs after the run: " + (dirty.join(", ") || "git diff not clean")); process.exit(1); }
process.exit(missed ? 1 : 0);
