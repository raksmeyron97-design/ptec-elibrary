"use client";
// app/admin/catalogs/CatalogAdminActions.tsx

import { useState, useTransition } from "react";
import Link from "next/link";
import type { CatalogBook } from "@/lib/catalog";
import { adjustCopies, hardDeleteCatalogBook } from "./actions";

export default function CatalogAdminActions({ book }: { book: CatalogBook }) {
  const [isPending, startTransition] = useTransition();
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showCopiesMenu, setShowCopiesMenu] = useState(false);
  const [note, setNote] = useState("");

  function handleAdjust(action: "check_in" | "check_out", delta: number) {
    startTransition(async () => {
      await adjustCopies(book.id, action, delta, note || undefined);
      setShowCopiesMenu(false);
      setNote("");
    });
  }

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
        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-[#007c91] hover:text-[#007c91]"
      >
        Edit
      </Link>

      {/* Copies button */}
      <div className="relative">
        <button
          onClick={() => setShowCopiesMenu((v) => !v)}
          disabled={isPending || !book.is_active}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50"
        >
          Copies
        </button>

        {showCopiesMenu && (
          <div className="absolute right-0 top-8 z-50 w-56 rounded-xl border border-slate-100 bg-white p-3 shadow-xl space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Adjust Copies</p>

            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-[#007c91] focus:ring-1 focus:ring-[#007c91]/20"
            />

            <div className="flex gap-2">
              <button
                onClick={() => handleAdjust("check_in", +1)}
                disabled={book.copies_available >= book.copies_total || isPending}
                className="flex-1 rounded-lg bg-emerald-50 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"
              >
                +1 Check In
              </button>
              <button
                onClick={() => handleAdjust("check_out", -1)}
                disabled={book.copies_available <= 0 || isPending}
                className="flex-1 rounded-lg bg-amber-50 py-1.5 text-xs font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-40"
              >
                −1 Check Out
              </button>
            </div>

            <p className="text-[10px] text-slate-400 text-center">
              {book.copies_available}/{book.copies_total} available
            </p>

            <button
              onClick={() => setShowCopiesMenu(false)}
              className="w-full rounded-lg py-1 text-xs text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Delete */}
      {!showConfirmDelete ? (
        <button
          onClick={() => setShowConfirmDelete(true)}
          disabled={!book.is_active || isPending}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-400 transition hover:border-red-300 hover:text-red-500 disabled:opacity-50"
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
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}