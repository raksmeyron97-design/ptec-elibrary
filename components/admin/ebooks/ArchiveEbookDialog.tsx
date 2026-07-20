"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Archive } from "lucide-react";

export type ArchiveTarget =
  | { kind: "single"; id: string; title: string }
  | { kind: "bulk"; ids: string[] };

export default function ArchiveEbookDialog({
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  target: ArchiveTarget;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("adminEbooks.archiveDialog");
  const headingId = "archive-ebook-heading";
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => confirmRef.current?.focus(), 0);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) { onCancel(); return; }
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const isBulk = target.kind === "bulk";
  const count = isBulk ? target.ids.length : 1;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => !busy && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-bg-surface p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Archive className="h-5 w-5" />
          </span>
          <div>
            <h2 id={headingId} className="text-lg font-bold text-text-heading">
              {isBulk ? t("titleBulk", { count }) : t("title")}
            </h2>
            <p className="mt-1.5 text-sm text-text-body">
              {isBulk
                ? t("bodyBulk", { count })
                : t("body", { title: target.title })}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold text-text-body transition hover:bg-paper disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? t("busy") : t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
