import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { EgressRecorder, isBilledInferenceHost } from "./egress";

/**
 * The cost claim, enforced rather than asserted.
 *
 * This pipeline exists to take Khmer OCR off a metered API. The OCR path it
 * replaces — `scripts/repair-khmer-pages.ts` — lives in the same directory,
 * imports the same storage helpers, writes the same table, and sends whole
 * PDFs to Gemini Vision. Nothing in the SHAPE of either script says which one
 * spends money, so "it does not call Google" has to be a checked property or
 * it is a comment that goes stale the first time someone adds a fallback.
 *
 * Two halves, because neither is sufficient:
 *
 *   static   no module on the OCR path may even import an AI SDK. Catches the
 *            fallback added in good faith six months from now.
 *   runtime  `EgressRecorder` refuses the request. Catches a dependency that
 *            reaches an endpoint nobody grepped for.
 *
 * What is NOT claimed: zero network traffic. The worker downloads a PDF from
 * storage and talks to Supabase, and saying otherwise would be false on the
 * first request. The claim is that no per-page inference is billed.
 */

const OCR_SOURCES = [
  "lib/ocr",
  "scripts/ocr-khmer-tesseract.ts",
  "scripts/audit-scanned-books.ts",
];

/**
 * Names that mean a hosted model is being called.
 *
 * `@google/genai` and `generativelanguage` are what the Gemini path this
 * replaces uses; the rest are the other providers a future "just add a
 * fallback" would reach for.
 */
const FORBIDDEN_IMPORTS = [
  "@google/genai",
  "@google-cloud/vision",
  "@google-cloud/documentai",
  "googleapis",
  "generativelanguage",
  "@ai-sdk/",
  "openai",
  "@anthropic-ai/",
  "lib/ai/",
];

/** Keys whose presence would mean an API is being paid for. */
const FORBIDDEN_ENV = ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "OPENAI_API_KEY"];

function* sourceFiles(target: string): Generator<string> {
  const stat = statSync(target);
  if (!stat.isDirectory()) {
    yield target;
    return;
  }
  for (const entry of readdirSync(target)) {
    const full = join(target, entry);
    if (statSync(full).isDirectory()) {
      yield* sourceFiles(full);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      yield full;
    }
  }
}

/**
 * Import specifiers only. A COMMENT naming Gemini is not a call — the modules
 * here explain at length why they are not the Gemini path, and a scan that
 * failed on the explanation would force the explanation out.
 */
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
    specs.push(match[1]);
  }
  return specs;
}

/** Strip comments and string-literal prose, leaving code. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

describe("the OCR path performs no hosted inference", () => {
  it("scans a non-empty set of files", () => {
    const files = OCR_SOURCES.flatMap((t) => [...sourceFiles(t)]);
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it("imports no AI SDK, no vision API and nothing from lib/ai", () => {
    const offenders: string[] = [];
    for (const target of OCR_SOURCES) {
      for (const file of sourceFiles(target)) {
        for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
          for (const forbidden of FORBIDDEN_IMPORTS) {
            if (spec.includes(forbidden)) offenders.push(`${file} imports ${spec}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("reads no API key from the environment", () => {
    const offenders: string[] = [];
    for (const target of OCR_SOURCES) {
      for (const file of sourceFiles(target)) {
        const code = codeOnly(readFileSync(file, "utf8"));
        for (const key of FORBIDDEN_ENV) {
          if (code.includes(`process.env.${key}`)) offenders.push(`${file} reads ${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the OCR env template free of provider keys", () => {
    const template = readFileSync("infra/ocr/.env.ocr.example", "utf8");
    for (const key of FORBIDDEN_ENV) {
      // Named in the prose that explains its absence, never as an assignment.
      expect(template).not.toMatch(new RegExp(`^\\s*${key}\\s*=`, "m"));
    }
  });
});

describe("EgressRecorder", () => {
  it("recognises the hosts that would mean a per-page bill", () => {
    expect(isBilledInferenceHost("generativelanguage.googleapis.com")).toBe(true);
    expect(isBilledInferenceHost("vision.googleapis.com")).toBe(true);
    expect(isBilledInferenceHost("api.openai.com")).toBe(true);
    expect(isBilledInferenceHost("API.ANTHROPIC.COM")).toBe(true);
  });

  it("does not flag the hosts this pipeline legitimately needs", () => {
    expect(isBilledInferenceHost("storage.storage-ptec.online")).toBe(false);
    expect(isBilledInferenceHost("supabase.storage-ptec.online")).toBe(false);
    expect(isBilledInferenceHost("127.0.0.1")).toBe(false);
    expect(isBilledInferenceHost("")).toBe(false);
  });

  /**
   * It REFUSES rather than reporting afterwards. A run that quietly called a
   * paid endpoint and mentioned it in the summary has already spent the money.
   */
  it("throws on a request to a billed endpoint instead of letting it through", async () => {
    const recorder = new EgressRecorder();
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("should never be reached")) as typeof globalThis.fetch;
    recorder.install();
    try {
      await expect(fetch("https://generativelanguage.googleapis.com/v1beta/models")).rejects.toThrow(
        /refusing a request/i,
      );
    } finally {
      recorder.restore();
      globalThis.fetch = original;
    }
  });

  it("records the hosts a legitimate run contacts, so the claim is auditable", async () => {
    const recorder = new EgressRecorder();
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("ok")) as typeof globalThis.fetch;
    recorder.install();
    try {
      await fetch("https://storage.example.org/books/a.pdf");
      await fetch("https://storage.example.org/books/b.pdf");
    } finally {
      recorder.restore();
      globalThis.fetch = original;
    }
    expect(recorder.hosts()).toEqual([{ host: "storage.example.org", count: 2 }]);
    expect(recorder.billedRequests()).toBe(0);
  });

  it("restores the original fetch so it cannot leak into the rest of a process", async () => {
    const recorder = new EgressRecorder();
    const original = globalThis.fetch;
    recorder.install();
    expect(globalThis.fetch).not.toBe(original);
    recorder.restore();
    expect(globalThis.fetch).toBe(original);
  });
});
