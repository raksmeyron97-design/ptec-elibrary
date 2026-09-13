import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  HttpStatusError,
  RETRY_DELAYS_MS,
  TransportError,
  classifyError,
  errorOutcome,
  exitCodeFor,
  fetchText,
  fetchWithRetry,
  incompleteBanner,
  summaryLine,
  tally,
} from "./http";

// ── A tiny origin whose behaviour is scripted per path ──────────────────────
// Real sockets, not a mocked fetch: the module's whole job is to tell "no
// answer" from "an answer we dislike", and only a real transport layer
// produces the first.
let server: Server;
let base = "";
const hits = new Map<string, number>();

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    const n = (hits.get(url) ?? 0) + 1;
    hits.set(url, n);

    if (url === "/ok") return res.writeHead(200).end("fine");
    if (url === "/missing") return res.writeHead(404).end("gone");
    if (url === "/broken") return res.writeHead(500).end("boom");
    if (url === "/flaky") return n < 3 ? res.writeHead(503).end("busy") : res.writeHead(200).end("recovered");
    if (url === "/hang") return; // never answers — exercises the timeout
    res.writeHead(200).end("default");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  base = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("the fault split: no answer vs. an answer we dislike", () => {
  it("returns a 2xx response untouched", async () => {
    expect(await fetchText(`${base}/ok`)).toBe("fine");
  });

  it("does NOT retry a 4xx — asking again cannot change a 404", async () => {
    hits.delete("/missing");
    await expect(fetchText(`${base}/missing`)).rejects.toBeInstanceOf(HttpStatusError);
    expect(hits.get("/missing")).toBe(1);
  });

  it("retries a 5xx and returns the recovery when it comes", async () => {
    hits.delete("/flaky");
    expect(await fetchText(`${base}/flaky`)).toBe("recovered");
    expect(hits.get("/flaky")).toBe(3);
  });

  it("reports a PERSISTENT 5xx as an answer, not as transport", async () => {
    hits.delete("/broken");
    const err = await fetchText(`${base}/broken`).catch((e) => e);
    expect(err).toBeInstanceOf(HttpStatusError);
    expect((err as HttpStatusError).status).toBe(500);
    // every retry was spent before giving up
    expect(hits.get("/broken")).toBe(RETRY_DELAYS_MS.length + 1);
  });

  it("reports an unroutable host as transport after every attempt", async () => {
    const err = await fetchText("http://127.0.0.1:1/nothing", { timeoutMs: 2000 }).catch((e) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).attempts).toBe(RETRY_DELAYS_MS.length + 1);
  });

  it("gives up on a socket that never answers, instead of hanging the run", async () => {
    const err = await fetchText(`${base}/hang`, { timeoutMs: 300 }).catch((e) => e);
    expect(err).toBeInstanceOf(TransportError);
  }, 10_000);

  it("lets a caller keep a status it wants to interpret itself", async () => {
    const res = await fetchWithRetry(`${base}/missing`, { allowStatuses: [404] });
    expect(res.status).toBe(404);
  });
});

describe("classification", () => {
  it("maps transport to unknown — the ONLY route to unknown", () => {
    expect(classifyError(new TransportError("reset", 3)).outcome).toBe("unknown");
    expect(classifyError(new HttpStatusError(500, "u")).outcome).toBe("fail");
    expect(classifyError(new Error("assertion")).outcome).toBe("fail");
  });

  it("maps a missing fixture to warn, everything else the origin said to fail", () => {
    expect(classifyError(new HttpStatusError(404, "u")).outcome).toBe("warn");
    expect(classifyError(new HttpStatusError(410, "u")).outcome).toBe("warn");
    expect(classifyError(new HttpStatusError(403, "u")).outcome).toBe("fail");
    expect(classifyError(new HttpStatusError(503, "u")).outcome).toBe("fail");
  });

  it("says out loud that a transport failure is not a defect", () => {
    expect(classifyError(new TransportError("x", 3)).detail).toContain("NOT a site defect");
  });

  it("errorOutcome is positional, and outcome comes first", () => {
    const [outcome, detail] = errorOutcome(new TransportError("x", 3));
    expect(outcome).toBe("unknown");
    expect(typeof detail).toBe("string");
  });
});

describe("the summary never folds unknown into a pass", () => {
  it("counts each outcome separately", () => {
    expect(tally(["ok", "ok", "fail", "unknown", "warn"])).toEqual({ ok: 2, fail: 1, warn: 1, unknown: 1 });
  });

  it("phrases an unanswered check as unchecked, not as passed", () => {
    const line = summaryLine(tally(["ok", "ok", "unknown"]));
    expect(line).toBe("2 passed, 1 could not be checked");
    expect(line).not.toContain("3 passed");
  });

  it("prints a banner only when something went unchecked", () => {
    expect(incompleteBanner(tally(["ok"]))).toBeNull();
    expect(incompleteBanner(tally(["ok", "unknown"]))).toContain("did NOT verify");
  });

  it("exits 1 for a defect, 0 for weather — unless strict", () => {
    expect(exitCodeFor(tally(["ok", "fail"]))).toBe(1);
    expect(exitCodeFor(tally(["ok", "unknown"]))).toBe(0);
    expect(exitCodeFor(tally(["ok", "unknown"]), true)).toBe(1);
    expect(exitCodeFor(tally(["ok", "warn"]), true)).toBe(1);
    expect(exitCodeFor(tally(["ok"]), true)).toBe(0);
  });
});

// ── Source scan: every verifier uses this vocabulary, and none has grown a
// private one back. The defect this module removed was four scripts each
// deciding for themselves what a dropped connection meant.
describe("every production verifier speaks this vocabulary", () => {
  const dir = join(__dirname, "..", "..", "scripts");
  const verifiers = readdirSync(dir).filter((f) => /^verify-.*\.ts$/.test(f));

  it("finds the verifiers", () => {
    expect(verifiers.length).toBeGreaterThanOrEqual(4);
  });

  for (const file of verifiers) {
    const src = readFileSync(join(dir, file), "utf8");

    it(`${file} imports the shared vocabulary`, () => {
      expect(src).toContain('from "../lib/verify/http"');
    });

    it(`${file} declares no private Outcome union`, () => {
      expect(src).not.toMatch(/type Outcome\s*=/);
    });

    it(`${file} never records a caught error as "fail" by fiat`, () => {
      // record(..., "fail", err.message) / (err as Error).message — the shape
      // that turned a socket reset into a defect.
      expect(src).not.toMatch(/"fail",\s*\(?err(?: as Error)?\)?\.message/);
    });

    it(`${file} never computes "passed" by subtraction`, () => {
      // length - failed - warned counts an unanswered check as a pass.
      expect(src).not.toMatch(/results\.length\s*-\s*failed\s*-\s*warned/);
    });

    it(`${file} ends with export {} (script scope isolation)`, () => {
      expect(src.trimEnd().endsWith("export {};")).toBe(true);
    });
  }
});
