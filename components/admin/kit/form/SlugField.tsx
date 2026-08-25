"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
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

/** Optional copy-to-clipboard affordance on the URL preview. */
export interface SlugFieldCopyLabels {
  copy: string;
  copied: string;
}

/**
 * The slug control for admin forms: derives from the record's title, shows the
 * URL that will result, and reports whether it is already taken.
 *
 * One component rather than the four that existed — posts, theses,
 * publications and (latterly) catalogs each grew their own, and they disagreed
 * on the things that matter. Only theses offered the copy affordance, only
 * catalogs offered a way back to the title, publications never slugified what
 * you typed, and none of them announced the availability verdict to a screen
 * reader.
 *
 * Auto-derivation stops the first time the field is edited by hand, and — the
 * part the older copies got wrong — it never starts on a record that already
 * has a slug. Mounting an edit form used to re-derive the slug from the title
 * and quietly discard a hand-picked one.
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
  htmlFor,
  takenIsError,
  copyLabels,
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
  /** Fixes the control's id, for forms that focus their fields by id. */
  htmlFor?: string;
  /**
   * Render "already taken" through the error slot rather than as status. Only
   * for forms whose save *rejects* a duplicate; where the action de-duplicates
   * with a numeric suffix, red would be a lie.
   */
  takenIsError?: boolean;
  /** Supply to offer "copy link" beside the URL preview. */
  copyLabels?: SlugFieldCopyLabels;
}) {
  // A record that arrives with a slug already owns it. Deriving over the top of
  // it on mount is what silently reset customized slugs on every edit.
  const [manual, setManual] = useState(() => value.trim().length > 0);
  // The probe's answer, tagged with the slug it answered about. Storing the
  // verdict rather than a status lets "checking" be derived — a slug we have no
  // answer for yet is, by definition, being checked — so nothing sets state
  // synchronously inside an effect. `available: null` is a probe that failed.
  const [probe, setProbe] = useState<{ slug: string; available: boolean | null } | null>(null);
  const [copied, setCopied] = useState(false);

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
        // A failed probe is not a verdict — say nothing rather than something
        // wrong, and let the save be the authority.
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

  const shownError = error ?? (takenIsError && availability === "taken" ? labels.taken : undefined);

  const status =
    availability === "checking" ? labels.checking
    : availability === "available" ? labels.available
    : availability === "taken" && !takenIsError ? labels.taken
    : "";

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(`${siteUrl}${routePrefix}/${value}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard denied (insecure context, or the user said no). The URL is on
         screen and selectable — silently doing nothing is the honest outcome,
         and a toast about a clipboard is not worth the interruption. */
    }
  }

  return (
    <Field
      label={labels.label}
      required={required}
      error={shownError}
      className={className}
      htmlFor={htmlFor}
      hint={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-all font-mono">
            {siteUrl}
            {routePrefix}/{value || "…"}
          </span>
          {copyLabels && value && (
            <button
              type="button"
              onClick={copyUrl}
              className="focus-field inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium text-text-muted transition hover:text-brand"
            >
              {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
              {copied ? copyLabels.copied : copyLabels.copy}
            </button>
          )}
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
          className={shownError ? `${MONO_INPUT_CLASS} border-danger` : MONO_INPUT_CLASS}
          name="slug"
          value={value}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setManual(true);
            onChange(slugify(e.target.value));
          }}
          // These forms submit on Enter; in a slug field that is nearly always a
          // mis-hit rather than an intent to save the whole record.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
      )}
    </Field>
  );
}
