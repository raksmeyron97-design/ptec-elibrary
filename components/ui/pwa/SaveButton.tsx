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
    <button type="button">
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
