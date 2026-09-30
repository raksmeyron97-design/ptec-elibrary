"use client";

import { useState, useTransition } from "react";
import { Globe, Loader2, Check, Lock } from "lucide-react";
import { setThesisOpenAccess } from "@/app/actions/theses";

/**
 * "Public full text" on the thesis edit page (SEO Phase 3.1/3.4, 0163).
 *
 * Opening a thesis publishes its PDF to everyone at /theses/<slug>/fulltext.pdf
 * and names it to Google Scholar. It needs a recorded licence (set in the
 * form) and the authors' consent (recorded here, once). The signed-in download
 * and the Download Access override beside this card are a separate door and
 * are not changed by it — except that an admin BLOCK there also keeps this
 * one shut.
 */
export default function OpenAccessCard({
  thesisId,
  slug,
  isPublished,
  hasFile,
  hasLicense,
  blocked,
  currentAccess,
  consentAt,
}: {
  thesisId: string;
  slug: string | null;
  isPublished: boolean;
  hasFile: boolean;
  hasLicense: boolean;
  /** Download Access override is "block". */
  blocked: boolean;
  currentAccess: "open" | "restricted";
  consentAt: string | null;
}) {
  const [open, setOpen] = useState(currentAccess === "open");
  const [consented, setConsented] = useState(Boolean(consentAt));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = open !== (currentAccess === "open");
  const blockers = [
    !hasLicense && "Record the licence in the form first.",
    !consentAt && !consented && open && "Confirm the authors' consent.",
  ].filter(Boolean) as string[];
  const effectivePublic = currentAccess === "open" && isPublished && hasFile && !blocked;
  const publicPath = slug ? `/theses/${encodeURIComponent(slug)}/fulltext.pdf` : null;

  const onSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setThesisOpenAccess(thesisId, open, consented);
      if (res.success) setSaved(true);
      else setError(res.error ?? "Failed to save.");
    });
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
      <div className="border-b border-divider px-6 pb-4 pt-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-text-heading">
          <Globe className="size-4 text-brand" />
          Public full text
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          An open thesis&rsquo;s PDF can be read by anyone without signing in, and Google Scholar is told
          where it is. It needs a licence and the authors&rsquo; consent. Restricted theses keep the
          signed-in download described in Download Access.
        </p>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div
          className={`rounded-xl border p-4 text-sm ${
            effectivePublic
              ? "border-success-line bg-success-soft text-success-text"
              : "border-divider bg-paper text-text-body"
          }`}
        >
          <p className="flex items-center gap-2 font-semibold">
            {effectivePublic ? <Globe className="size-4" /> : <Lock className="size-4" />}
            {effectivePublic ? "Open: the full text is public" : "Restricted: the full text is not public"}
          </p>
          {effectivePublic && publicPath && (
            <p className="mt-1 break-all text-xs">
              <a href={publicPath} className="underline" target="_blank" rel="noreferrer">
                {publicPath}
              </a>
            </p>
          )}
          {currentAccess === "open" && !effectivePublic && (
            <p className="mt-1 text-xs">
              Marked open, but not served:{" "}
              {[!isPublished && "the thesis is not published", !hasFile && "there is no PDF", blocked && "Download Access is set to Block"]
                .filter(Boolean)
                .join("; ")}
              .
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-text-body">
          <input
            type="checkbox"
            checked={consented}
            disabled={Boolean(consentAt)}
            onChange={(e) => setConsented(e.target.checked)}
            className="mt-0.5 size-4 text-brand focus:ring-brand"
          />
          <span>
            The authors have consented to their full text being public.
            {consentAt && (
              <span className="block text-xs text-text-muted">
                Recorded {new Date(consentAt).toLocaleDateString()}.
              </span>
            )}
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-text-heading">
          <input
            type="checkbox"
            checked={open}
            onChange={(e) => setOpen(e.target.checked)}
            className="mt-0.5 size-4 text-brand focus:ring-brand"
          />
          <span>Publish the full text openly</span>
        </label>
        {open && blockers.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-text-muted">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-divider bg-paper px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
        {error && (
          <span role="alert" className="text-sm text-danger-text">
            {error}
          </span>
        )}
        {saved && !dirty && (
          <span className="inline-flex items-center gap-1 text-sm text-success-text">
            <Check className="size-4" /> Saved
          </span>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !dirty || (open && blockers.length > 0)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save public access
        </button>
      </div>
    </section>
  );
}
