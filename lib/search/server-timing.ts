// lib/search/server-timing.ts
//
// Per-leg timing for the search route, as a standard `Server-Timing` header
// (Phase 9.0, docs/UNIFIED-DISCOVERY.md).
//
// The native route fans one query out to six collections plus page text, and
// the only latency anyone could see was the client's wall clock: production's
// p95 was 4.3 s overall and 14.5 s for author queries (2026-09-19), with no way
// to say WHICH leg was slow. A per-leg budget (Phase 9.1) must be set from
// measurements, not guessed — too tight and a slow-but-correct leg is cut off
// on every author query; too loose and a stuck catalogue query still holds the
// whole page. This header is the measurement.
//
// Pure: no server imports, so the benchmark and the tests can use it.

/** A metric name as the header grammar allows it (an RFC 7230 token). */
function metricName(name: string): string {
  return name.replace(/[^A-Za-z0-9!#$%&'*+.^_`|~-]/g, "_") || "metric";
}

export class ServerTiming {
  private readonly started = performance.now();
  private readonly entries: { name: string; dur?: number; desc?: string }[] = [];

  /** Time one leg. The leg's own outcome — value or throw — passes through unchanged. */
  async time<T>(name: string, work: Promise<T>): Promise<T> {
    const t0 = performance.now();
    try {
      return await work;
    } finally {
      this.entries.push({ name: metricName(name), dur: performance.now() - t0 });
    }
  }

  /** A metric with no duration, e.g. `cache;desc=hit`. */
  note(name: string, desc: string): void {
    this.entries.push({ name: metricName(name), desc });
  }

  /** The header value, with `total` (since construction) last. */
  header(): string {
    const parts = this.entries.map(({ name, dur, desc }) =>
      [name, dur !== undefined ? `dur=${dur.toFixed(1)}` : null, desc ? `desc="${desc.replace(/["\\]/g, "")}"` : null]
        .filter(Boolean)
        .join(";"),
    );
    parts.push(`total;dur=${(performance.now() - this.started).toFixed(1)}`);
    return parts.join(", ");
  }
}

/** Parse a `Server-Timing` value into `{ name: ms }` (durations only; last one wins). */
export function parseServerTiming(value: string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!value) return out;
  for (const metric of value.split(",")) {
    const [rawName, ...params] = metric.split(";").map((s) => s.trim());
    if (!rawName) continue;
    const dur = params.find((p) => p.toLowerCase().startsWith("dur="));
    const ms = dur ? Number(dur.slice(4)) : NaN;
    if (Number.isFinite(ms)) out[rawName] = ms;
  }
  return out;
}
