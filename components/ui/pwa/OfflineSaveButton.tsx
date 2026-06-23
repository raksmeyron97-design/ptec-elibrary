"use client";

import { useState, useEffect } from "react";
import Icon from "@/components/ui/core/Icon";
import { isOfflineBookSaved, saveOfflineBookMeta, removeOfflineBookMeta } from "@/lib/offline";

type Props = {
  bookId: string;
  bookSlug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  coverColor: string | undefined;
  pdfUrl: string;
  isLoggedIn: boolean;
};

export default function OfflineSaveButton({
  bookId, bookSlug, title, author, coverUrl, coverColor, pdfUrl, isLoggedIn
}: Props) {
  const [status, setStatus] = useState<"idle" | "downloading" | "saved">("idle");
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if ('caches' in window) {
      setIsSupported(true);
      if (isOfflineBookSaved(bookId)) {
        setStatus("saved");
      }
    }
  }, [bookId]);

  if (!isSupported) return null;

  const handleToggle = async () => {
    if (!isLoggedIn) {
      window.location.href = `/auth/login?callbackUrl=/books/${bookSlug}`;
      return;
    }

    if (status === "saved") {
      if (confirm("Remove this book from offline storage?")) {
        removeOfflineBookMeta(bookId);
        setStatus("idle");
      }
      return;
    }

    if (status === "downloading") return;

    try {
      setStatus("downloading");
      
      const cache = await caches.open('offline-books');
      // The SW only caches /api/books/*/file when ?offline=1 is present
      // (to avoid silently storing private PDFs without user intent).
      const offlinePdfUrl = pdfUrl.startsWith('/api/') ? `${pdfUrl}?offline=1` : pdfUrl;
      const urlsToCache = [offlinePdfUrl];
      if (coverUrl) urlsToCache.push(coverUrl);

      await cache.addAll(urlsToCache);
      
      saveOfflineBookMeta({
        id: bookId,
        slug: bookSlug,
        title,
        author,
        coverUrl,
        coverColor,
        pdfUrl,
        savedAt: Date.now()
      });
      
      setStatus("saved");
    } catch (error) {
      console.error("Failed to save book for offline use:", error);
      alert("Failed to download book. Please try again or check your storage.");
      setStatus("idle");
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={status === "downloading"}
      className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-divider bg-paper px-6 py-3.5 text-sm font-semibold text-text-body transition hover:border-brand hover:text-brand disabled:opacity-50"
    >
      {status === "downloading" ? (
        <>
          <Icon name="spinner" className="text-[20px] animate-spin" />
          Downloading...
        </>
      ) : status === "saved" ? (
        <>
          <Icon name="check" className="text-[20px]" />
          Saved Offline
        </>
      ) : (
        <>
          <Icon name="download" className="text-[20px]" />
          Save Offline
        </>
      )}
    </button>
  );
}
