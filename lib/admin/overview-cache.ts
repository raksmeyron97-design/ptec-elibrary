import "server-only";

import { cache } from "react";
import { getActionCenter, getHealthPulse } from "./intelligence";

/**
 * Request-scoped memoisation for the two reads the dashboard asks for twice:
 * once for the header's status chips (streamed in their own Suspense
 * boundary) and once for the Overview body. Uncached, every page load ran the
 * health probe's four counts and the attention queue's eleven queries twice.
 *
 * React's `cache` keys on argument IDENTITY, so both callers must pass the
 * same filters object — the page resolves `activeFilters` once and hands that
 * one object to both.
 */
export const getActionCenterOnce = cache(getActionCenter);
export const getHealthPulseOnce = cache(getHealthPulse);
