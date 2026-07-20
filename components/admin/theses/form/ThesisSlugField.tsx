"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
}: {
  title: string;
  slug: string;
  onSlugChange: (slug: string) => void;
  thesisId?: string;
  disabled?: boolean;
  siteUrl: string;
}) {
  const t = useTranslations("adminPostForm.slug");
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const [availability, setAvailability] = useState<Availability>("idle");
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

  return (
    <div>
      <label htmlFor="thesis-slug-field" className="mb-1.5 block text-sm font-semibold text-text-body">
        {t("label")} <span className="text-red-500">*</span>
      </label>
      <input
        id="thesis-slug-field"
        name="slug"
        value={slug}
        onChange={(e) => { setManuallyEdited(true); onSlugChange(slugify(e.target.value)); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        disabled={disabled}
        required
        aria-invalid={availability === "taken"}
        aria-describedby="thesis-slug-help"
        className="h-10 w-full rounded-lg border border-divider px-3.5 font-mono text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60"
      />
      <p id="thesis-slug-help" className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
        <span className="font-mono">{siteUrl}/theses/{slug || "…"}</span>
        {availability === "checking" && <span className="text-text-muted">{t("checking")}</span>}
        {availability === "available" && <span className="font-semibold text-emerald-600">{t("available")}</span>}
        {availability === "taken" && <span className="font-semibold text-red-600">{t("taken")}</span>}
      </p>
    </div>
  );
}
