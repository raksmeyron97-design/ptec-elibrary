import { splitDuration } from "@/lib/learning-paths/format";

/** Translation-function shape we need (next-intl's `t`), narrowed to avoid a hard dep. */
type TFn = (key: string, values?: Record<string, string | number>) => string;

/**
 * Localized "1h 30m" / "45m" / "2h" from a minute total, using the `paths`
 * namespace duration keys. Returns null when there's no duration to show.
 */
export function formatDuration(totalMinutes: number | null | undefined, t: TFn): string | null {
  const parts = splitDuration(totalMinutes);
  if (!parts) return null;
  const { hours, minutes } = parts;
  if (hours > 0 && minutes > 0) return t("durationHm", { h: hours, m: minutes });
  if (hours > 0) return t("durationH", { h: hours });
  return t("durationM", { m: minutes });
}
