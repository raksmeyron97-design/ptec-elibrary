"use client";

import { useEffect, useRef, useState } from "react";
import { slugify } from "@/lib/admin/posts-shared";
import { checkSlugAvailableAction } from "@/app/(admin)/admin/(protected)/posts/actions";

type Availability = "idle" | "checking" | "available" | "taken";

export default function PostSlugField({
  title,
  slug,
  onSlugChange,
  postId,
  disabled,
  siteUrl,
}: {
  title: string;
  slug: string;
  onSlugChange: (slug: string) => void;
  postId?: string;
  disabled?: boolean;
  siteUrl: string;
}) {
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
      const available = await checkSlugAvailableAction(clean, postId);
      setAvailability(available ? "available" : "taken");
    }, 400);
    return () => clearTimeout(timer);
  }, [slug, postId]);

  return (
    <div>
      <label htmlFor="slug-field" className="mb-1.5 block text-sm font-semibold text-text-body">
        Slug <span className="text-red-500">*</span>
      </label>
      <input
        id="slug-field"
        name="slug"
        value={slug}
        onChange={(e) => { setManuallyEdited(true); onSlugChange(slugify(e.target.value)); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        disabled={disabled}
        required
        aria-invalid={availability === "taken"}
        aria-describedby="slug-help"
        className="h-10 w-full rounded-lg border border-divider px-3.5 font-mono text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60"
      />
      <p id="slug-help" className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
        <span className="font-mono">{siteUrl}/posts/{slug || "…"}</span>
        {availability === "checking" && <span className="text-text-muted">Checking…</span>}
        {availability === "available" && <span className="font-semibold text-emerald-600">Available</span>}
        {availability === "taken" && <span className="font-semibold text-red-600">Already taken — choose another</span>}
      </p>
    </div>
  );
}
