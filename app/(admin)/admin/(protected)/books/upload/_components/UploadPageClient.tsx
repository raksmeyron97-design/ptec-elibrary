"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileUp, Layers } from "lucide-react";
import UploadForm from "./UploadForm";
import BulkUploadForm from "./BulkUploadForm";
import ManageCategoriesModal from "@/components/admin/ManageCategoriesModal";
import ManageDepartmentsModal from "@/components/admin/ManageDepartmentsModal";

type Mode = "single" | "bulk";

/**
 * Single vs bulk: the one decision that comes before any field.
 *
 * A real tablist, keyboard-operable per the WAI-ARIA pattern (arrows move
 * focus, Enter/Space activates), replacing two `<button>`s that carried an
 * inline `linear-gradient(135deg,#1E3A8A,#2A47A6)` and mutated their own
 * `style.color` on mouseenter — hardcoded outside the token system, invisible
 * to the focus system, and inert for a keyboard user. The panels are separate
 * because they are separate workflows, not two views of one record, so
 * switching deliberately does not preserve field values across them.
 */
export default function UploadPageClient({
  recentBooks = [],
  initialTitle = "",
}: {
  recentBooks?: unknown[];
  initialTitle?: string;
}) {
  const t = useTranslations("adminUpload");
  const [mode, setMode] = useState<Mode>("single");
  const listRef = useRef<HTMLDivElement>(null);
  const idPrefix = useId().replace(/:/g, "");

  const modes: { key: Mode; label: string; icon: typeof FileUp }[] = [
    { key: "single", label: t("tabSingle"), icon: FileUp },
    { key: "bulk", label: t("tabBulk"), icon: Layers },
  ];

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, key: Mode) {
    const index = modes.findIndex((m) => m.key === key);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : -1;
      const next = modes[(index + delta + modes.length) % modes.length].key;
      document.getElementById(`${idPrefix}-mode-${next}`)?.focus();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setMode(key);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          ref={listRef}
          role="tablist"
          aria-label={t("modeLabel")}
          className="inline-flex w-fit items-center gap-1 rounded-xl border border-divider bg-paper p-1"
        >
          {modes.map(({ key, label, icon: Icon }) => {
            const active = mode === key;
            return (
              <button
                key={key}
                id={`${idPrefix}-mode-${key}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`${idPrefix}-panel-${key}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setMode(key)}
                onKeyDown={(e) => onKeyDown(e, key)}
                className={`focus-field inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm transition-colors duration-150 ${
                  active
                    ? "bg-bg-surface font-semibold text-brand shadow-sm"
                    : "font-medium text-text-muted hover:text-text-body"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Taxonomy management: needed *while* filling the form, when the right
            category does not exist yet, so it stays on the page rather than
            behind a trip out to the collection page. */}
        <div className="flex items-center gap-2">
          <ManageCategoriesModal />
          <ManageDepartmentsModal />
        </div>
      </div>

      {modes.map(({ key }) => (
        <div
          key={key}
          id={`${idPrefix}-panel-${key}`}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-mode-${key}`}
          hidden={mode !== key}
        >
          {mode === key &&
            (key === "single" ? (
              <UploadForm recentBooks={recentBooks} initialTitle={initialTitle} />
            ) : (
              <BulkUploadForm />
            ))}
        </div>
      ))}
    </div>
  );
}
