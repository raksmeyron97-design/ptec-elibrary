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
      const urlsToCache = [pdfUrl];
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
      onClick={handleToggle}
      disabled={status === "downloading"}
      className={`inline-flex items-center justify-center gap-2 rounded-[14px] border px-6 py-3.5 text-[15px] font-bold transition-all
        ${status === "saved" 
          ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100" 
          : "border-brand bg-brand/5 text-brand hover:bg-brand hover:text-brand-contrast"
        }
        ${status === "downloading" ? "opacity-70 cursor-not-allowed" : ""}
      `}
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
