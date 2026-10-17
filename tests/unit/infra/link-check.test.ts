import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { collectUrls, classify, checkUrl, checkAll, renderReport } from "../../../scripts/link-check";

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? "";
    if (path === "/ok") res.writeHead(200).end("ok");
    else if (path === "/redir") res.writeHead(302, { location: "/ok" }).end();
    else if (path === "/head405") {
      if (req.method === "HEAD") res.writeHead(405).end();
      else res.writeHead(200).end("ok");
    } else if (path === "/forbidden") res.writeHead(403).end();
    else if (path === "/limited") res.writeHead(429).end();
    else if (path === "/ua") res.writeHead(/Mozilla/.test(req.headers["user-agent"] ?? "") ? 200 : 400).end();
    else res.writeHead(404).end("nope");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("collectUrls", () => {
  it("walks nested objects and arrays, dedupes, and ignores non-http strings", () => {
    const data = {
      a: "https://example.org/a",
      b: [{ c: "see http://example.org/b, and https://example.org/a" }, 5, null, "mailto:x@y.z"],
      d: { e: { f: "ftp://nope.example/x" } },
    };
    expect([...collectUrls(data)].sort()).toEqual(["http://example.org/b", "https://example.org/a"]);
  });
});

describe("classify", () => {
  it("maps statuses", () => {
    expect(classify(200)).toBe("alive");
    expect(classify(301)).toBe("alive");
    expect(classify(401)).toBe("blocked");
    expect(classify(403)).toBe("blocked");
    expect(classify(429)).toBe("blocked");
    expect(classify(404)).toBe("dead");
    expect(classify(500)).toBe("dead");
    expect(classify(null)).toBe("dead");
  });
});

describe("checkUrl", () => {
  it("handles alive, redirect, HEAD-405 fallback, blocked, dead and browser UA", async () => {
    expect((await checkUrl(`${base}/ok`)).cls).toBe("alive");
    expect((await checkUrl(`${base}/redir`)).cls).toBe("alive");
    expect((await checkUrl(`${base}/head405`)).cls).toBe("alive");
    expect((await checkUrl(`${base}/forbidden`)).cls).toBe("blocked");
    expect((await checkUrl(`${base}/limited`)).cls).toBe("blocked");
    expect((await checkUrl(`${base}/missing`)).cls).toBe("dead");
    expect((await checkUrl(`${base}/ua`)).cls).toBe("alive");
  });

  it("reports an unreachable host as dead without throwing", async () => {
    const r = await checkUrl("http://127.0.0.1:1/x", 2000);
    expect(r.cls).toBe("dead");
    expect(r.status).toBeNull();
  });

  it("checkAll keeps input order and the report lists dead and blocked separately", async () => {
    const urls = [`${base}/ok`, `${base}/missing`, `${base}/forbidden`];
    const results = await checkAll(urls, 2);
    expect(results.map((r) => r.cls)).toEqual(["alive", "dead", "blocked"]);
    const md = renderReport(results);
    expect(md).toContain(`- ${base}/missing (404)`);
    expect(md).toContain("## חסומים לבדיקה אוטומטית");
  });
});
