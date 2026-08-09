import type { DiscoveryRate } from "@/lib/admin/dashboard-shared";

export const MIN_MEANINGFUL_PREVIOUS_BASE = 20;

/** Presentation-only comparison math retained from EngagementPathways. */
export function deriveRateComparison(input: {
  current: DiscoveryRate;
  previous: DiscoveryRate;
  previousDenominator: number;
  compare: boolean;
  collecting: boolean;
}): { showPrevious: boolean; delta: number | null } {
  const previousMeaningful = input.previousDenominator >= MIN_MEANINGFUL_PREVIOUS_BASE;
  const showPrevious =
    input.compare &&
    !input.collecting &&
    previousMeaningful &&
    input.previous.pct !== null &&
    input.previous.comparable;
  const delta =
    showPrevious &&
    input.current.pct !== null &&
    input.current.comparable &&
    input.previous.pct !== null
      ? Math.round((input.current.pct - input.previous.pct) * 10) / 10
      : null;
  return { showPrevious, delta };
}
