"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { Field, MONO_INPUT_CLASS } from "@/components/admin/kit/form";
import { slugify } from "@/lib/admin/theses-shared";
import { checkThesisSlugAvailable } from "@/app/actions/theses";

type Availability = "idle" | "checking" | "available" | "taken";

export default function ThesisSlugField({
  title,
  slug,
  onSlugChange,
  thesisId,
  disabled,
  siteUrl,
  error,
}: {
  title: string;
  slug: string;
  onSlugChange: (slug: string) => void;
  thesisId?: string;
  disabled?: boolean;
  siteUrl: string;
  error?: string;
}) {
  const t = useTranslations("adminPostForm.slug");
  const tThesis = useTranslations("adminThesisForm.basic");
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const [availability, setAvailability] = useState<Availability>("idle");
  const [copied, setCopied] = useState(false);
  const lastChecked = useRef<string>("");

  // Auto-derive the slug from the title until the user edits it directly.
  useEffect(() => {
    if (manuallyEdited) return;
    onSlugChange(slugify(title));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, manuallyEdited]);

  // Debounced live-availability check.
  useEffect(() => {
    const clean = slugify(slug);
    if (!clean || clean === lastChecked.current) return;
    setAvailability("checking");
    const timer = setTimeout(async () => {
      lastChecked.current = clean;
      const available = await checkThesisSlugAvailable(clean, thesisId);
      setAvailability(available ? "available" : "taken");
    }, 400);
    return () => clearTimeout(timer);
  }, [slug, thesisId]);

  const publicUrl = `${siteUrl}/theses/${slug}`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard denied (insecure context, or the user said no). The URL is
         on screen and selectable — silently doing nothing is the honest
         outcome, and a toast about a clipboard is not worth the interruption. */
    }
  }

  return (
    <Field
      label={t("label")}
      required
      htmlFor="thesis-slug-field"
      error={error ?? (availability === "taken" ? t("taken") : undefined)}
      hint={
        /*
          The URL is what the author is actually deciding, so it is shown whole
          rather than as a bare slug they have to assemble in their head — and
          it is copyable, because the first thing anyone does with a new thesis
          page is send someone the link.
        */
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono break-all">{siteUrl}/theses/{slug || "…"}</span>
          {slug && (
            <button
              type="button"
              onClick={copyUrl}
              className="focus-field inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium text-text-muted transition hover:text-brand"
            >
              {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
              {copied ? tThesis("copied") : tThesis("copyLink")}
            </button>
          )}
          {availability === "checking" && <span>{t("checking")}</span>}
          {availability === "available" && <span className="font-semibold text-success">{t("available")}</span>}
        </span>
      }
    >
      <input
        id="thesis-slug-field"
        name="slug"
        value={slug}
        onChange={(e) => { setManuallyEdited(true); onSlugChange(slugify(e.target.value)); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        disabled={disabled}
        required
        aria-invalid={availability === "taken" || Boolean(error) ? true : undefined}
        className={MONO_INPUT_CLASS}
      />
    </Field>
  );
}
