"use client";

// components/ui/SaveButton.tsx
import { useState, useTransition } from "react";
import { toggleSaveBook } from "@/app/actions/saved-books";
import Icon from "@/components/ui/core/Icon";

type SaveButtonProps = {
  bookId: string;
  bookSlug: string;
  initialSaved: boolean;
  isLoggedIn: boolean;
};

export default function SaveButton({
  bookId,
  bookSlug,
  initialSaved,
  isLoggedIn,
}: SaveButtonProps) {
  const [saved, setSaved]       = useState(initialSaved);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!isLoggedIn) {
      window.location.href = `/auth/login?callbackUrl=/books/${bookSlug}`;
      return;
    }
    // Optimistic update
    setSaved((v) => !v);
    startTransition(async () => {
      try {
        const result = await toggleSaveBook(bookId, bookSlug);
        setSaved(result.saved);
      } catch {
        // Revert on error
        setSaved((v) => !v);
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`inline-flex items-center justify-center gap-2.5 rounded-[14px] border px-5 py-3.5 text-[15px] font-semibold transition disabled:opacity-60 ${
        saved
          ? "border-brand bg-brand/10 text-brand hover:bg-brand/15"
          : "border-divider text-text-body hover:border-brand hover:text-text-heading"
      }`}
    >
      <Icon
        name={saved ? "bookmark" : "bookmark-plus"}
        className="text-[20px]"
      />
      {isPending
        ? "..."
        : saved
        ? "Saved"
        : "Save resource"}
    </button>
  );
}
