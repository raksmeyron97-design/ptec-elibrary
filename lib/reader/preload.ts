/* Adaptive preload policy for the PDF reader.

   How many pages around the one being read are worth mounting depends on the
   link, and a mounted page is not free: each one holds a canvas at up to DPR 2
   (≈ 11–22 MB at a 1,000 px page width) and costs range requests through the
   authorised proxy. So the tiers are deliberately narrow — the "fast" tier is
   one page more per side than today's constant, not five — and NOTHING is
   preloaded until page 1 has painted, because first-page latency is the
   number this reader is measured on.

   Network Information is progressive enhancement: `navigator.connection` is
   Chromium-only, so the default tier is what every other browser gets. */

export type NetworkTier = "slow" | "normal" | "fast";

export type NetworkHints = {
  /** `navigator.connection.effectiveType` — "slow-2g" | "2g" | "3g" | "4g". */
  effectiveType?: string;
  /** `navigator.connection.saveData`. */
  saveData?: boolean;
  /** `navigator.connection.downlink`, Mbps. */
  downlink?: number;
};

export type PreloadPolicy = {
  tier: NetworkTier;
  /** Continuous mode: rows mounted before/after the visible window. */
  overscan: number;
  /** Single-page mode: neighbours rendered off-screen (0, 1 = next only, 2 = prev+next). */
  neighbours: number;
};

export function classifyNetwork(hints: NetworkHints | undefined): NetworkTier {
  if (!hints) return "normal";
  if (hints.saveData) return "slow";
  const type = hints.effectiveType;
  if (type === "slow-2g" || type === "2g") return "slow";
  if (type === "3g") return "normal";
  // A measured downlink is more specific than the coarse label.
  if (typeof hints.downlink === "number") {
    if (hints.downlink < 1.5) return "slow";
    return hints.downlink >= 10 ? "fast" : "normal";
  }
  if (type === "4g") return "fast";
  return "normal";
}

export function preloadPolicy(
  hints: NetworkHints | undefined,
  firstPagePainted: boolean,
): PreloadPolicy {
  const tier = classifyNetwork(hints);
  if (!firstPagePainted) {
    // Page 1 first. The visible window still mounts; only the extra rows wait.
    return { tier, overscan: 0, neighbours: 0 };
  }
  switch (tier) {
    case "slow":
      return { tier, overscan: 1, neighbours: 1 };
    case "fast":
      return { tier, overscan: 3, neighbours: 2 };
    default:
      return { tier, overscan: 2, neighbours: 2 };
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
