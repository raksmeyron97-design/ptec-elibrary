"use client";
// app/admin/catalogs/CatalogAdminActions.tsx

import { useState, useTransition } from "react";
import Link from "next/link";
import type { CatalogBook } from "@/lib/catalog";
import Icon from "@/components/ui/core/Icon";
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
    <div className="flex items-center justify-end gap-3 text-text-muted">
      {/* Edit */}
      <Link
        href={`/admin/catalogs/edit/${book.id}`}
        className="text-text-muted transition hover:text-brand"
        title="Edit"
      >
        <Icon name="edit" className="w-5 h-5" />
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
        <button type="button" onClick={() => setShowConfirmDelete(true)}
          disabled={!book.is_active || isPending}
          className="text-text-muted transition hover:text-red-500 disabled:opacity-50"
          title="Delete"
        >
          <Icon name="trash" className="w-5 h-5" />
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <button type="button">
            {isPending ? "…" : "Confirm"}
          </button>
          <button type="button" onClick={() => setShowConfirmDelete(false)}
            className="rounded-lg border border-divider px-2 py-1 text-xs text-text-muted transition hover:bg-paper"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}