/* Adaptive preload policy for the PDF reader.

   How many pages around the one being read are worth mounting depends on the
   link, and a mounted page is not free: each one holds a canvas at up to DPR 2
   (≈ 11–22 MB at a 1,000 px page width) and costs range requests through the
   authorised proxy. So the tiers are deliberately narrow, and NOTHING is
   preloaded until page 1 has painted, because first-page latency is the
   number this reader is measured on.

   Two sources decide the tier, in this order:
     1. Network Information (`navigator.connection`) — Chromium only.
     2. What the first page actually cost: bytes and milliseconds from
        Resource Timing, which every browser reports. Safari and Firefox get
        their tier from this; Chromium uses it only when the hints are silent.
   Neither present → "normal", exactly the pre-existing default.

   The page counts and byte budgets per tier live in lib/reader/budgets.ts;
   this module only decides WHICH tier applies. */

export type NetworkTier = "slow" | "normal" | "fast";

export type NetworkHints = {
  /** `navigator.connection.effectiveType` — "slow-2g" | "2g" | "3g" | "4g". */
  effectiveType?: string;
  /** `navigator.connection.saveData`. */
  saveData?: boolean;
  /** `navigator.connection.downlink`, Mbps. */
  downlink?: number;
};

/** What painting the first page actually cost, from Resource Timing. */
export type MeasuredTransfer = {
  bytes: number;
  durationMs: number;
};

export type PreloadPolicy = {
  tier: NetworkTier;
  /** Continuous mode: rows mounted before/after the visible window (legacy
      symmetric figure — the planner uses `prefetchPages`). */
  overscan: number;
  /** Continuous mode: total pages beyond the visible window the planner may
      admit, before the byte and canvas budgets are applied. */
  prefetchPages: number;
  /** Single-page mode: neighbours rendered off-screen (0, 1 = next only, 2 = prev+next). */
  neighbours: number;
};

/** Below this the measurement is dominated by request latency, not throughput. */
const MIN_MEASURABLE_BYTES = 64 * 1024;
/** A first page that takes this long is slow whatever the bytes say. */
const SLOW_FIRST_PAGE_MS = 8_000;
const SLOW_MBPS = 1.5;
const FAST_MBPS = 10;

/** Tier from what was measured, or undefined when the sample is too small
    to trust. Throughput is bytes over wall time, so it already includes the
    per-request latency of the proxy — which is what the reader feels. */
export function classifyMeasured(measured: MeasuredTransfer | undefined): NetworkTier | undefined {
  if (!measured || !Number.isFinite(measured.durationMs) || measured.durationMs <= 0) return undefined;
  if (measured.durationMs >= SLOW_FIRST_PAGE_MS) return "slow";
  if (!Number.isFinite(measured.bytes) || measured.bytes < MIN_MEASURABLE_BYTES) return undefined;
  const mbps = (measured.bytes * 8) / (measured.durationMs / 1000) / 1_000_000;
  if (mbps < SLOW_MBPS) return "slow";
  if (mbps >= FAST_MBPS) return "fast";
  return "normal";
}

export function classifyNetwork(hints: NetworkHints | undefined, measured?: MeasuredTransfer): NetworkTier {
  if (hints?.saveData) return "slow";
  const type = hints?.effectiveType;
  if (type === "slow-2g" || type === "2g") return "slow";
  if (type === "3g") return "normal";
  // A measured downlink is more specific than the coarse label.
  if (typeof hints?.downlink === "number") {
    if (hints.downlink < 1.5) return "slow";
    return hints.downlink >= 10 ? "fast" : "normal";
  }
  if (type === "4g") return "fast";
  // No usable hint (Safari, Firefox): what the first page cost decides.
  return classifyMeasured(measured) ?? "normal";
}

export function preloadPolicy(
  hints: NetworkHints | undefined,
  firstPagePainted: boolean,
  measured?: MeasuredTransfer,
): PreloadPolicy {
  const tier = classifyNetwork(hints, measured);
  if (!firstPagePainted) {
    // Page 1 first. The visible window still mounts; only the extra rows wait.
    return { tier, overscan: 0, prefetchPages: 0, neighbours: 0 };
  }
  switch (tier) {
    case "slow":
      return { tier, overscan: 1, prefetchPages: 2, neighbours: 1 };
    case "fast":
      return { tier, overscan: 3, prefetchPages: 6, neighbours: 2 };
    default:
      return { tier, overscan: 2, prefetchPages: 4, neighbours: 2 };
  }
}

/** Read the hints the browser exposes, or undefined where it exposes none. */
export function readNetworkHints(nav: unknown): NetworkHints | undefined {
  const conn = (nav as { connection?: Record<string, unknown> } | undefined)?.connection;
  if (!conn || typeof conn !== "object") return undefined;
  return {
    effectiveType: typeof conn.effectiveType === "string" ? conn.effectiveType : undefined,
    saveData: typeof conn.saveData === "boolean" ? conn.saveData : undefined,
    downlink: typeof conn.downlink === "number" ? conn.downlink : undefined,
  };
}
