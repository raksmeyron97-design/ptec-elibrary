"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, LockOpen, Loader2, Check, Trophy } from "lucide-react";
import { useToast } from "@/components/admin/kit";
import { setThesisDownloadOverride } from "@/app/actions/theses";
import { effectiveThesisDownloadPolicy, type ThesisListRow } from "@/lib/admin/theses-shared";

type Override = "inherit" | "allow" | "block";

/**
 * Reader-download permission, as a control rather than a badge.
 *
 * The column used to render a green "ALLOWED" / red "BLOCKED" pill, which read
 * as a computed status — something the row was reporting — when it is in fact
 * the one setting on this screen an admin is expected to change. Worse, the two
 * states a librarian must distinguish (blocked *automatically* because the
 * thesis is Top-10 protected, vs. blocked *by a person*) were both the same red
 * pill with the difference in a `title` tooltip.
 *
 * So: a lock/unlock button with a visible word next to it, opening a tri-state
 * menu. `inherit` is named "Automatic" and shows what the automatic rule
 * currently resolves to, so choosing it is not a leap of faith. The server
 * permission engine stays authoritative — this only writes the override, and
 * the label is a mirror of its rule for immediate feedback.
 */
export default function ThesisDownloadControl({ thesis }: { thesis: ThesisListRow }) {
  const t = useTranslations("adminTheses.downloadPolicy");
  const toast = useToast();
  /**
   * Optimistic value, tagged with the server value it was based on. Once a
   * refresh lands and `thesis.downloadOverride` no longer matches that base,
   * the server wins automatically — which is why there is no effect here
   * syncing state to props. That version reset local state on every parent
   * re-render of the row, discarding an in-flight choice.
   */
  const [optimistic, setOptimistic] = useState<{ base: Override; value: Override } | null>(null);
  const override: Override =
    optimistic && optimistic.base === thesis.downloadOverride ? optimistic.value : thesis.downloadOverride;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const effective = effectiveThesisDownloadPolicy({ ...thesis, downloadOverride: override });
  const allowed = effective.policy === "allowed";
  const automaticLabel = effectiveThesisDownloadPolicy({ ...thesis, downloadOverride: "inherit" }).policy === "allowed"
    ? t("allowed")
    : t("blocked");

  async function choose(next: Override) {
    setOpen(false);
    if (next === override) return;
    setOptimistic({ base: thesis.downloadOverride, value: next });  // the word changes at once
    setSaving(true);
    try {
      const res = await setThesisDownloadOverride(thesis.id, next);
      if (!res?.success) throw new Error(res?.error ?? t("saveFailed"));
      toast.success(t("saved"));
    } catch (err) {
      setOptimistic(null);      // never leave a lie on screen
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const options: { value: Override; label: string; hint: string }[] = [
    { value: "inherit", label: t("automatic"), hint: t("automaticHint", { policy: automaticLabel }) },
    { value: "allow", label: t("adminAllow"), hint: t("allowHint") },
    { value: "block", label: t("adminBlock"), hint: t("blockHint") },
  ];

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`focus-field inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition disabled:opacity-60 ${
          allowed
            ? "border-success-line bg-success-soft text-success-text hover:border-success"
            : "border-danger-line bg-danger-soft text-danger-text hover:border-danger"
        }`}
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : allowed ? (
          <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {allowed ? t("dlAllowed") : t("dlBlocked")}
        <span className="sr-only">
          {" — "}
          {override === "inherit" ? t("automatic") : override === "allow" ? t("adminAllow") : t("adminBlock")}
          {". "}
          {t("changeAria", { title: thesis.title })}
        </span>
      </button>

      {/* Why it is blocked, when a person did not choose it. */}
      {override === "inherit" && effective.isTopTen && thesis.rank != null && (
        <span className="mt-1 flex items-center justify-center gap-1 text-[10px] font-semibold text-warning-text">
          <Trophy className="h-3 w-3" aria-hidden="true" /> {t("topTen", { rank: thesis.rank })}
        </span>
      )}
      {override !== "inherit" && (
        <span className="mt-1 block text-[9px] uppercase tracking-wide text-text-muted">
          {override === "allow" ? t("adminAllow") : t("adminBlock")}
        </span>
      )}

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("changeAria", { title: thesis.title })}
          className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-divider bg-bg-surface p-1.5 text-left shadow-xl"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitemradio"
              aria-checked={override === opt.value}
              onClick={() => choose(opt.value)}
              className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-paper"
            >
              <span className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true">
                {override === opt.value && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-text-body">{opt.label}</span>
                <span className="block text-[11px] leading-snug text-text-muted">{opt.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
