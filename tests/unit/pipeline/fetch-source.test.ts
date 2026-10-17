import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchSource } from "../../../scripts/fetch-source.ts";
import { loadSnapshot, sha256 } from "../../../scripts/lib/pipeline.ts";
import { REPO } from "./helpers.ts";

const ID = "test-election";
const DATA = Buffer.from(JSON.stringify({ builtAt: "2026-10-17", parties: [{ id: "alpha" }, { id: "beta" }] }));
const PAGES: Record<string, Buffer> = {
  alpha: Buffer.from('<html><body><details class="claim" id="claim-a1"><summary>a</summary></details></body></html>'),
  beta: Buffer.from('<html><body><p id="claim-b1">ב</p></body></html>'),
};

let server: Server;
let base = "";
const requests: string[] = [];
const scratch = join(REPO, ".tmp");
const roots: string[] = [];

/** A data root with config/site.json and one election pointing at the local server. */
function makeRoot(): string {
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "fetch-source-"));
  roots.push(root);
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "config/site.json"), JSON.stringify({ currentElection: ID, elections: [ID] }));
  mkdirSync(join(root, "data/elections", ID), { recursive: true });
  writeFileSync(
    join(root, "data/elections", ID, "election.json"),
    `{\n  "id": "${ID}",\n  "timezone": "Asia/Jerusalem",\n  "source": {\n    "baseUrl": "${base}",\n    "dataUrl": "${base}data.json",\n    "evidencePath": "parties/{id}-evidence.html"\n  },\n  "snapshot": "2026-10-01"\n}\n`,
  );
  return root;
}
const snapDir = (root: string, date: string) => join(root, "data/elections", ID, "sources/snapshots", date);

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push(req.url ?? "");
    const m = /^\/parties\/([a-z]+)-evidence\.html$/.exec(req.url ?? "");
    const body = req.url === "/data.json" ? DATA : m && PAGES[m[1]];
    if (!body) return void res.writeHead(404).end();
    res.writeHead(200).end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(() => {
  server.close();
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe("fetch-source, download mode", () => {
  it("downloads data.json and every evidence page into a snapshot that loadSnapshot accepts", async () => {
    const root = makeRoot();
    const now = new Date("2026-10-17T22:30:00Z"); // 01:30 on 18.10 in Jerusalem
    const r = await fetchSource(root, { now });
    expect(r.date).toBe("2026-10-18");
    expect(requests).toEqual(expect.arrayContaining(["/data.json", "/parties/alpha-evidence.html", "/parties/beta-evidence.html"]));
    const dir = snapDir(root, "2026-10-18");
    const snap = loadSnapshot(dir);
    expect(snap.dataSha).toBe(sha256(DATA));
    expect(snap.evidence).toEqual({ alpha: PAGES.alpha.toString(), beta: PAGES.beta.toString() });
    const m = snap.manifest;
    expect(m.method).toBe("auto");
    expect(m.date).toBe("2026-10-18");
    expect(m.fetchedAt).toBe(now.toISOString());
    expect(m.sourceBuiltAt).toBe("2026-10-17");
    expect(Object.keys(m.files)).toEqual(["data.json", "evidence-html/alpha-evidence.html.gz", "evidence-html/beta-evidence.html.gz", "evidence-html.sha256"]);
    expect(readFileSync(join(dir, "evidence-html.sha256"), "utf8")).toBe(
      `${sha256(PAGES.alpha)}  alpha-evidence.html\n${sha256(PAGES.beta)}  beta-evidence.html\n`,
    );
    // deterministic gzip: mtime 0, max compression flag, round trip
    const gz = readFileSync(join(dir, "evidence-html/alpha-evidence.html.gz"));
    expect([...gz.subarray(4, 9)]).toEqual([0, 0, 0, 0, 2]);
    expect(gunzipSync(gz).equals(PAGES.alpha)).toBe(true);
    expect(readdirSync(join(root, "data/elections", ID, "sources/snapshots"))).toEqual(["2026-10-18"]);
    // without --activate election.json keeps its snapshot
    expect(readFileSync(join(root, "data/elections", ID, "election.json"), "utf8")).toContain('"snapshot": "2026-10-01"');
  });

  it("--activate writes the new date into election.json and nothing else", async () => {
    const root = makeRoot();
    const file = join(root, "data/elections", ID, "election.json");
    const before = readFileSync(file, "utf8");
    await fetchSource(root, { election: ID, date: "2026-10-20", activate: true });
    expect(readFileSync(file, "utf8")).toBe(before.replace('"snapshot": "2026-10-01"', '"snapshot": "2026-10-20"'));
  });

  it("two downloads of the same pages give identical bytes, and an existing snapshot is not overwritten", async () => {
    const root = makeRoot();
    await fetchSource(root, { date: "2026-10-21" });
    await fetchSource(root, { date: "2026-10-22" });
    const a = snapDir(root, "2026-10-21"), b = snapDir(root, "2026-10-22");
    for (const f of ["data.json", "evidence-html/alpha-evidence.html.gz", "evidence-html/beta-evidence.html.gz", "evidence-html.sha256"])
      expect(readFileSync(join(a, f)).equals(readFileSync(join(b, f)))).toBe(true);
    await expect(fetchSource(root, { date: "2026-10-21" })).rejects.toThrow(/already exists/);
  });

  it("a failed page download leaves no snapshot behind", async () => {
    const root = makeRoot();
    const saved = PAGES.beta;
    delete PAGES.beta;
    try {
      await expect(fetchSource(root, { date: "2026-10-23" })).rejects.toThrow(/answered 404/);
    } finally {
      PAGES.beta = saved;
    }
    expect(existsSync(join(root, "data/elections", ID, "sources/snapshots"))).toBe(false);
  });
});

describe("fetch-source, --from a manual browser export", () => {
  const exportDir = () => {
    const root = makeRoot();
    const dir = join(root, "export");
    mkdirSync(dir);
    writeFileSync(join(dir, "data.json"), DATA);
    for (const [pid, html] of Object.entries(PAGES)) writeFileSync(join(dir, `${pid}-evidence.html`), html);
    return { root, dir };
  };

  it("imports with a matching --sha256; loadSnapshot accepts the result", async () => {
    const { root, dir } = exportDir();
    await fetchSource(root, { from: dir, sha256: sha256(DATA), date: "2026-10-17" });
    const snap = loadSnapshot(snapDir(root, "2026-10-17"));
    expect(snap.manifest.method).toBe("manual-browser-export");
    expect(snap.manifest.note).toContain(sha256(DATA));
    expect(Object.keys(snap.evidence)).toEqual(["alpha", "beta"]);
  });

  it("refuses with exit 1 when --sha256 does not match data.json, and writes nothing", () => {
    const { root, dir } = exportDir();
    const wrong = "0".repeat(64);
    let status = 0;
    let stderr = "";
    try {
      execFileSync(process.execPath, [join(REPO, "node_modules/tsx/dist/cli.mjs"), join(REPO, "scripts/fetch-source.ts"), "--from", dir, "--sha256", wrong], {
        env: { PATH: process.env.PATH, LH_DATA_ROOT: root },
        stdio: "pipe",
      });
    } catch (e) {
      status = (e as { status: number }).status;
      stderr = String((e as { stderr: Buffer }).stderr);
    }
    expect(status).toBe(1);
    expect(stderr).toMatch(/import refused: data\.json SHA-256 is [0-9a-f]{64}, expected 0{64}/);
    expect(existsSync(join(root, "data/elections", ID, "sources/snapshots"))).toBe(false);
  });

  it("refuses an export that lacks a party's evidence page", async () => {
    const { root, dir } = exportDir();
    rmSync(join(dir, "beta-evidence.html"));
    await expect(fetchSource(root, { from: dir, date: "2026-10-17" })).rejects.toThrow(/no beta-evidence\.html/);
  });
});

describe("fetch-source output matches the committed snapshot's format", () => {
  // The committed .gz files were made by another gzip implementation, so only the uncompressed content is comparable.
  it("re-importing the committed 17.10 snapshot reproduces its data.json, evidence-html.sha256 and uncompressed page hashes", async () => {
    const committed = join(REPO, "data/elections/2026-knesset-26/sources/snapshots/2026-10-17");
    const root = makeRoot();
    const dir = join(root, "export");
    mkdirSync(dir);
    cpSync(join(committed, "data.json"), join(dir, "data.json"));
    for (const f of readdirSync(join(committed, "evidence-html")))
      writeFileSync(join(dir, f.replace(/\.gz$/, "")), gunzipSync(readFileSync(join(committed, "evidence-html", f))));
    const want = JSON.parse(readFileSync(join(committed, "manifest.json"), "utf8"));
    await fetchSource(root, { from: dir, sha256: want.files["data.json"], date: "2026-10-17" });
    const got = loadSnapshot(snapDir(root, "2026-10-17")).manifest;
    const plain = (f: Record<string, string>) => Object.fromEntries(Object.entries(f).filter(([k]) => !k.endsWith(".gz")));
    expect(Object.keys(got.files)).toEqual(Object.keys(want.files));
    expect(plain(got.files)).toEqual(plain(want.files));
    expect(got.evidenceHtmlSha256).toEqual(want.evidenceHtmlSha256);
  });
});
