/* lib/ocr/egress.ts
 *
 * Proof, at runtime, that recognition did not call a hosted OCR service.
 *
 * ── Why a claim in a comment was not enough ─────────────────────────────────
 *
 * The OCR path this replaces (`scripts/repair-khmer-pages.ts`) sends whole
 * PDFs to Gemini Vision, and it lives two files away in the same directory,
 * importing the same storage helpers and writing the same table. A reader of
 * either script cannot tell from its shape which one spends money. A source
 * scan (`lib/ocr/no-google-ocr.test.ts`) settles the static half — this module
 * settles the half a static scan cannot: what the process ACTUALLY contacted
 * while it ran, including through a transitive dependency nobody grepped.
 *
 * ── What is honestly being claimed ──────────────────────────────────────────
 *
 * Not "zero network traffic". The worker still downloads a PDF from storage
 * and still talks to Supabase, and saying otherwise would be false on the
 * first request. The claim is narrower and checkable: **no Google AI or
 * hosted-OCR endpoint is contacted, so OCR costs nothing per page.** The
 * recorder prints every host it saw, so the claim is auditable rather than
 * asserted — an operator reads the list.
 *
 * Recognition itself runs in a child process (`tesseract`), which `fetch`
 * cannot see. That is the point rather than a gap: the recognizer is a local
 * binary reading a local PNG, and the only way it could reach a network
 * service is through a request this recorder would have caught.
 */

/**
 * Hosts that mean money per page.
 *
 * Deliberately broader than the API this repository uses: the rule is "no
 * hosted OCR / vision inference", not "not the specific SDK we removed", and a
 * future dependency reaching for a different provider must trip the same wire.
 */
const BILLED_INFERENCE_HOSTS: readonly RegExp[] = [
  /(^|\.)googleapis\.com$/i,
  /(^|\.)google\.com$/i,
  /(^|\.)gstatic\.com$/i,
  /(^|\.)cloud\.google\.com$/i,
  /(^|\.)openai\.com$/i,
  /(^|\.)azure\.com$/i,
  /(^|\.)cognitiveservices\.azure\.com$/i,
  /(^|\.)amazonaws\.com$/i,
  /(^|\.)anthropic\.com$/i,
];

/** Would a request to this host mean a hosted inference bill? */
export function isBilledInferenceHost(host: string): boolean {
  const normalized = (host ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (normalized.length === 0) return false;
  return BILLED_INFERENCE_HOSTS.some((re) => re.test(normalized));
}

export type EgressRecord = { host: string; count: number };

/**
 * Records outbound `fetch` hosts, and refuses the ones that would be billed.
 *
 * Refusing rather than merely counting is deliberate: a run that quietly
 * called a paid endpoint and reported it afterwards has already spent the
 * money. The throw carries the host so the operator can see which dependency
 * did it.
 */
export class EgressRecorder {
  private readonly counts = new Map<string, number>();
  private original: typeof globalThis.fetch | null = null;

  /** Patch `fetch`. Idempotent — a second call does nothing. */
  install(): void {
    if (this.original) return;
    const original = globalThis.fetch;
    this.original = original;
    const record = (input: RequestInfo | URL): Error | null => {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      let host: string;
      try {
        host = new URL(raw).host.toLowerCase();
      } catch {
        host = "(unparseable)";
      }
      this.counts.set(host, (this.counts.get(host) ?? 0) + 1);
      if (isBilledInferenceHost(host.replace(/:\d+$/, ""))) {
        return new Error(
          `OCR egress guard: refusing a request to ${host}. This pipeline performs ` +
            `recognition locally with Tesseract and must never call a hosted OCR or ` +
            `inference API.`,
        );
      }
      return null;
    };

    // A REJECTED PROMISE, never a synchronous throw. `fetch` is specified to
    // return a promise and to signal failure through it, and code written
    // against that — `fetch(url).catch(...)`, an un-awaited call inside an
    // event handler — turns a synchronous throw into an unhandled exception
    // somewhere unrelated to the request. The guard must be the clearest
    // failure in the process, not the most surprising one.
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const refusal = record(input);
      if (refusal) return Promise.reject(refusal);
      return original(input, init);
    }) as typeof globalThis.fetch;
  }

  /** Restore the original `fetch`. */
  restore(): void {
    if (!this.original) return;
    globalThis.fetch = this.original;
    this.original = null;
  }

  /** Every host contacted while installed, busiest first. */
  hosts(): EgressRecord[] {
    return [...this.counts.entries()]
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));
  }

  /** Requests to hosts that would have been billed. Always 0, or we threw. */
  billedRequests(): number {
    let total = 0;
    for (const { host, count } of this.hosts()) {
      if (isBilledInferenceHost(host.replace(/:\d+$/, ""))) total += count;
    }
    return total;
  }
}
