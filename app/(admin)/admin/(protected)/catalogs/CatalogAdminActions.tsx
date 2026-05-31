"use client";
// app/admin/catalogs/CatalogAdminActions.tsx

import { useState, useTransition } from "react";
import Link from "next/link";
import type { CatalogBook } from "@/lib/catalog";
import { hardDeleteCatalogBook } from "./actions";
import CopiesManager from "./CopiesManager";

export default function CatalogAdminActions({ book }: { book: CatalogBook }) {
  const [isPending, startTransition] = useTransition();
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      await hardDeleteCatalogBook(book.id);
      setShowConfirmDelete(false);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {/* Edit */}
      <Link
        href={`/admin/catalogs/edit/${book.id}`}
        className="rounded-lg border border-divider px-2.5 py-1 text-xs font-semibold text-text-body transition hover:border-brand hover:text-brand"
      >
        Edit
      </Link>

      {/* Copies — now uses the full CopiesManager panel */}
      {book.is_active && (
        <CopiesManager
          bookId={book.id}
          bookShelfLocation={book.shelf_location}
        />
      )}

      {/* Delete */}
      {!showConfirmDelete ? (
        <button
          onClick={() => setShowConfirmDelete(true)}
          disabled={!book.is_active || isPending}
          className="rounded-lg border border-divider px-2.5 py-1 text-xs font-semibold text-text-muted transition hover:border-red-300 hover:text-red-500 disabled:opacity-50"
        >
          Delete
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
          >
            {isPending ? "…" : "Confirm"}
          </button>
          <button
            onClick={() => setShowConfirmDelete(false)}
            className="rounded-lg border border-divider px-2 py-1 text-xs text-text-muted transition hover:bg-paper"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}