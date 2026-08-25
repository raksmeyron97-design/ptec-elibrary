"use client";

import { useEffect, useState } from "react";
import { unicodeSlug } from "@/lib/slug";
import Field from "./Field";
import { MONO_INPUT_CLASS } from "./styles";

type Availability = "idle" | "checking" | "available" | "taken";

export interface SlugFieldLabels {
  label: string;
  /** Shown while the slug still tracks the title. */
  autoHint: string;
  /** Label of the affordance that hands the slug back to the title. */
  reset: string;
  checking: string;
  available: string;
  taken: string;
}

/**
 * The slug control for admin create forms: derives from the record's title,
 * shows the URL that will result, and reports whether it is already taken.
 *
 * Lifted into the kit rather than written a fourth time. Posts
 * (`PostSlugField`), theses and publications each grew their own copy, and they
 * disagree on the details that matter — only one offers a way back to the title
 * after a manual edit, and none of them announce the availability result to a
 * screen reader.
 *
 * Auto-derivation stops the first time the field is edited by hand. That is
 * deliberate: a cataloguer who shortens a slug does not want the next keystroke
 * in the title to throw the edit away. `reset` is the way back.
 */
export default function SlugField({
  value,
  onChange,
  source,
  routePrefix,
  siteUrl,
  labels,
  checkAvailability,
  slugify = unicodeSlug,
  disabled,
  error,
  required,
  className,
}: {
  value: string;
  onChange: (slug: string) => void;
  /** The field the slug follows — normally the title. */
  source: string;
  /** Public route the record will live under, e.g. "/catalogs". */
  routePrefix: string;
  siteUrl: string;
  labels: SlugFieldLabels;
  /** Omit to skip the live check — the preview and derivation still work. */
  checkAvailability?: (slug: string) => Promise<boolean>;
  slugify?: (value: string) => string;
  disabled?: boolean;
  error?: string;
  required?: boolean;
  /** Passed through to the Field wrapper — a slug is always full width. */
  className?: string;
}) {
  const [manual, setManual] = useState(false);
  // The probe's answer, tagged with the slug it answered about. Storing the
  // verdict rather than a status lets "checking" be derived — a slug we have no
  // answer for yet is, by definition, being checked — so nothing sets state
  // synchronously inside an effect. `available: null` is a probe that failed.
  const [probe, setProbe] = useState<{ slug: string; available: boolean | null } | null>(null);

  useEffect(() => {
    if (manual) return;
    onChange(slugify(source));
    // onChange/slugify are stable callers' concern; re-running on their
    // identity would fight the parent's render cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, manual]);

  useEffect(() => {
    if (!checkAvailability || !value || probe?.slug === value) return;
    const timer = setTimeout(async () => {
      try {
        setProbe({ slug: value, available: await checkAvailability(value) });
      } catch {
        // A failed probe is not a verdict — the insert still resolves
        // collisions server-side, so say nothing rather than something wrong.
        setProbe({ slug: value, available: null });
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, probe]);

  const availability: Availability =
    !checkAvailability || !value ? "idle"
    : probe?.slug !== value ? "checking"
    : probe.available === null ? "idle"
    : probe.available ? "available"
    : "taken";

  const status =
    availability === "checking" ? labels.checking
    : availability === "available" ? labels.available
    : availability === "taken" ? labels.taken
    : "";

  return (
    <Field
      label={labels.label}
      required={required}
      error={error}
      className={className}
      hint={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-all font-mono">
            {siteUrl}
            {routePrefix}/{value || "…"}
          </span>
          {/* One polite region, always mounted: swapping the node in and out
              re-announces "available" every time the slug is re-checked. */}
          <span
            role="status"
            aria-live="polite"
            className={
              availability === "taken" ? "font-semibold text-danger"
              : availability === "available" ? "font-semibold text-success-text"
              : "text-text-muted"
            }
          >
            {status}
          </span>
        </span>
      }
      labelSuffix={
        manual ? (
          <button
            type="button"
            onClick={() => setManual(false)}
            disabled={disabled}
            className="focus-field rounded text-xs font-medium text-brand transition hover:text-brand-hover hover:underline disabled:opacity-60"
          >
            {labels.reset}
          </button>
        ) : (
          <span className="text-xs text-text-muted">{labels.autoHint}</span>
        )
      }
    >
      {(p) => (
        <input
          {...p}
          className={error ? `${MONO_INPUT_CLASS} border-danger` : MONO_INPUT_CLASS}
          name="slug"
          value={value}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setManual(true);
            onChange(slugify(e.target.value));
          }}
          // The wizard submits on Enter; in a slug field that is nearly always
          // a mis-hit rather than an intent to save the whole record.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
      )}
    </Field>
  );
}
