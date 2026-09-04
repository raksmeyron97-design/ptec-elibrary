"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { parsePageInput } from "@/lib/reader/page-input";
import ReaderModal from "./ReaderModal";

/* "Go to page": a numeric field (Khmer numerals accepted), Enter submits,
   Escape closes, out-of-range numbers clamp rather than fail. */
export default function ReaderPageNavigator({
  open,
  onClose,
  currentPage,
  numPages,
  onGo,
  fmt,
}: {
  open: boolean;
  onClose: () => void;
  currentPage: number;
  numPages: number;
  onGo: (page: number) => void;
  fmt: (n: number | string) => string;
}) {
  const t = useTranslations("reader");
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(String(currentPage));
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [open, currentPage]);

  const parsed = parsePageInput(value, numPages);
  const submit = () => {
    if (parsed === null) return;
    onGo(parsed);
    onClose();
  };

  return (
    <ReaderModal
      open={open}
      onClose={onClose}
      title={t("goToPage")}
      description={t("goToPageHint", { min: fmt(1), max: fmt(numPages) })}
      footer={
        <>
          <button type="button" onClick={onClose} className="reader-btn reader-btn--outline px-4">
            {t("cancel")}
          </button>
          <button type="button" onClick={submit} disabled={parsed === null} className="reader-btn reader-btn--primary px-5">
            {t("go")}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9០-៩]*"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={t("goToPage")}
          aria-invalid={value !== "" && parsed === null}
          className="reader-input text-center text-[18px] font-bold tabular-nums"
        />
        <span className="reader-muted shrink-0 text-[14px] tabular-nums">/ {fmt(numPages)}</span>
      </form>
    </ReaderModal>
  );
}
