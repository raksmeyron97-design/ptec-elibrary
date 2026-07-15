"use client";
// app/admin/catalogs/CatalogAdminActions.tsx

import { useState, useTransition } from "react";
import Link from "next/link";
import type { CatalogBook } from "@/lib/catalog";
import Icon from "@/components/ui/core/Icon";
import { deleteCatalogBook, restoreCatalogBook, hardDeleteCatalogBook } from "./actions";

export default function CatalogAdminActions({ book, copyCount }: { book: CatalogBook; copyCount?: number }) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"unlist" | "purge" | null>(null);

  function handleUnlist() {
    startTransition(async () => {
      await deleteCatalogBook(book.id);
      setConfirming(null);
    });
  }

  function handleRestore() {
    startTransition(async () => {
      await restoreCatalogBook(book.id);
    });
  }

  function handlePurge() {
    startTransition(async () => {
      await hardDeleteCatalogBook(book.id);
      setConfirming(null);
    });
  }

  if (confirming) {
    const isPurge = confirming === "purge";
    return (
      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
        <span className="text-[10px] font-semibold text-text-muted">
          {isPurge ? "Delete permanently (copies too)?" : "Remove from public catalog?"}
        </span>
        <button
          type="button"
          onClick={isPurge ? handlePurge : handleUnlist}
          disabled={isPending}
          className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
        >
          {isPending ? "…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(null)}
          className="rounded-lg border border-divider px-2 py-1 text-xs text-text-muted transition hover:bg-paper"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-3 text-text-muted">
      {/* Edit book info */}
      <Link
        href={`/admin/catalogs/edit/${book.id}`}
        className="text-text-muted transition hover:text-brand"
        title="Edit book information"
        aria-label={`Edit ${book.title}`}
      >
        <Icon name="edit" className="h-5 w-5" />
      </Link>

      {/* Manage physical copies */}
      <Link
        href={`/admin/catalogs/edit/${book.id}?tab=copies`}
        className="relative text-text-muted transition hover:text-brand"
        title="Manage physical copies"
        aria-label={`Manage physical copies of ${book.title}`}
      >
        <Icon name="library" className="h-5 w-5" />
        {typeof copyCount === "number" && copyCount > 0 && (
          <span aria-hidden className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand px-0.5 text-[8px] font-bold text-white ring-2 ring-bg-surface">
            {copyCount}
          </span>
        )}
      </Link>

      {/* Preview public page */}
      {book.is_active && (
        <a
          href={`/catalogs/${book.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-muted transition hover:text-brand"
          title="View public page"
          aria-label={`View public page of ${book.title}`}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 3h6v6M10 14 21 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      )}

      {book.is_active ? (
        <button
          type="button"
          onClick={() => setConfirming("unlist")}
          disabled={isPending}
          className="text-text-muted transition hover:text-red-500 disabled:opacity-50"
          title="Remove from public catalog (kept in admin)"
          aria-label={`Remove ${book.title} from the public catalog`}
        >
          <Icon name="trash" className="h-5 w-5" />
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={handleRestore}
            disabled={isPending}
            className="rounded-lg border border-emerald-300 px-2 py-1 text-[10px] font-bold text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
            title="Restore to the public catalog"
          >
            Restore
          </button>
          <button
            type="button"
            onClick={() => setConfirming("purge")}
            disabled={isPending}
            className="rounded-lg border border-red-200 px-2 py-1 text-[10px] font-bold text-red-500 transition hover:bg-red-50 disabled:opacity-50"
            title="Delete permanently"
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}
