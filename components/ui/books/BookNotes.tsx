"use client";

import { useState, useCallback, useRef } from "react";
import { FileText, Check } from "lucide-react";
import { saveBookNote } from "@/app/actions/book-notes";
import Link from "next/link";
import { useLocale } from "next-intl";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function BookNotes({
  bookId,
  initialContent,
  isLoggedIn,
  bookSlug,
}: {
  bookId: string;
  initialContent: string;
  isLoggedIn: boolean;
  bookSlug: string;
}) {
  const locale = useLocale();
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleAutoSave = useCallback(
    (text: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setStatus("saving");
        const result = await saveBookNote(bookId, text);
        setStatus(result.success ? "saved" : "error");
        setTimeout(() => setStatus("idle"), 2500);
      }, 1000);
    },
    [bookId]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    scheduleAutoSave(e.target.value);
  };

  if (!isLoggedIn) {
    return (
      <div className="gradient-top-border overflow-hidden rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
        <h3 className="mb-3 inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-text-heading">
          <FileText className="h-4 w-4 text-brand" /> My Notes
        </h3>
        <p className="text-[13px] text-text-muted mb-3">
          Sign in to take private notes on this book.
        </p>
        <Link
          href={`/auth/login?callbackUrl=${locale === "km" ? "/km" : ""}/books/${bookSlug}`}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-hover transition-colors"
        >
          Sign In to Take Notes
        </Link>
      </div>
    );
  }

  return (
    <div className="gradient-top-border overflow-hidden rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-text-heading">
          <FileText className="h-4 w-4 text-brand" /> My Notes
        </h3>
        <span
          className={`text-[11px] font-medium transition-opacity duration-200 ${
            status === "idle" ? "opacity-0" : "opacity-100"
          } ${
            status === "saving"
              ? "text-text-muted"
              : status === "saved"
              ? "text-green-500"
              : status === "error"
              ? "text-red-400"
              : ""
          }`}
        >
          {status === "saving" && "Saving…"}
          {status === "saved" && (
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          {status === "error" && "Failed to save"}
        </span>
      </div>

      <textarea
        value={content}
        onChange={handleChange}
        placeholder="Add your private notes about this book… (auto-saved as you type)"
        rows={5}
        className="w-full resize-none rounded-xl border border-divider bg-bg-app px-3.5 py-3 text-[13px] leading-relaxed text-text-body placeholder:text-text-muted/60 outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/10 transition-all"
      />

      <p className="mt-1.5 text-[11px] text-text-muted">
        Private · only you can see these notes.
      </p>
    </div>
  );
}
