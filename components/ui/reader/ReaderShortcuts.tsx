"use client";

import { useTranslations } from "next-intl";
import { READER_SHORTCUTS } from "@/lib/reader/shortcuts";
import ReaderModal from "./ReaderModal";

/* Keyboard shortcuts, generated from the one list the handler uses. */
export default function ReaderShortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("reader");
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");
  return (
    <ReaderModal open={open} onClose={onClose} title={t("keyboardShortcuts")}>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        {READER_SHORTCUTS.map((s) => (
          <div key={s.action} className="contents">
            <dt className="flex flex-wrap items-center gap-1">
              {s.display.map((k, i) => (
                <span key={k} className="flex items-center gap-1">
                  {i > 0 && <span className="reader-faint text-[11px]">/</span>}
                  <kbd className="reader-kbd">
                    {s.modifier === "mod" ? `${isMac ? "⌘" : "Ctrl"} ${k}` : k}
                  </kbd>
                </span>
              ))}
            </dt>
            <dd className="text-[13px] leading-5">{t(s.labelKey)}</dd>
          </div>
        ))}
      </dl>
    </ReaderModal>
  );
}
