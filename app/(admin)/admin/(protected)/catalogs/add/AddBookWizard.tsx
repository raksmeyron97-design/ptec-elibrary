"use client";

import { useState } from "react";
import Link from "next/link";
import { addCatalogBook } from "../actions";
import AddCopiesClient from "../add-copies/[bookId]/AddCopiesClient";
import TagInput from "@/components/ui/core/TagInput";

interface BookData {
  id: string;
  slug: string;
  title: string;
  author: string;
  shelf_location: string | null;
  accession_number: string | null;
}

export default function AddBookWizard({ categories }: { categories: string[] }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [book, setBook] = useState<BookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAddBook(formData: FormData) {
    setError(null);
    setLoading(true);

    try {
      const result = await addCatalogBook(formData);
      if (result.success && result.book) {
        setBook({
          ...result.book,
          title: formData.get("title") as string,
          author: formData.get("author") as string,
        });
        setStep(2);
      } else {
        setError(result.error || "Failed to add book.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = `
    w-full rounded-xl border border-divider bg-paper/50
    px-3.5 py-2.5 text-sm text-text-heading placeholder:text-text-muted
    outline-none transition
    focus:border-brand/50 focus:bg-bg-surface focus:ring-2 focus:ring-focus-ring/15
  `;

  if (step === 2 && book) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href="/admin/catalogs"
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-brand transition mb-3"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M19 12H5m0 0 7 7m-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to catalogue admin
          </Link>

          {/* Step indicators */}
          <div className="mb-5 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">✓</span>
              <span className="text-sm font-semibold text-text-muted">Book Info</span>
            </div>
            <div className="h-px w-8 bg-paper" />
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">2</span>
              <span className="text-sm font-bold text-text-body">Physical Copies</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-text-heading">Add Physical Copies</h1>

          {/* Book summary pill */}
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-divider bg-bg-surface px-3 py-1.5 shadow-sm">
            <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            <span className="text-xs font-semibold text-text-body">{book.title}</span>
            <span className="text-xs text-text-muted">· {book.author}</span>
          </div>
        </div>

        <AddCopiesClient
          bookId={book.id}
          bookSlug={book.slug}
          defaultShelfLocation={book.shelf_location ?? ""}
          defaultAccession={book.accession_number ?? ""}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/admin/catalogs" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-brand transition mb-3">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M19 12H5m0 0 7 7m-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to catalogue admin
        </Link>
        <h1 className="text-2xl font-bold text-text-heading">Add Physical Book</h1>
        <p className="text-sm text-text-muted mt-1">Add a new book to the physical library catalogue.</p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-brand/5 px-4 py-3">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4m0-4h.01" strokeLinecap="round" />
        </svg>
        <p className="text-xs text-brand">
          <span className="font-bold">Physical copies are managed separately.</span>{" "}
          After saving this book, you will immediately be able to add individual copy records with barcodes, call numbers, and shelf locations on this same screen.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 font-semibold">
          {error}
        </div>
      )}

      {/* Form */}
      <form action={handleAddBook} className="rounded-2xl bg-bg-surface border border-divider shadow-sm p-6 space-y-5">

        {/* ── Core info ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Title *</label>
            <input name="title" required className={inputCls} placeholder="e.g. Introduction to Cambodian Law" />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Author *</label>
            <input name="author" required className={inputCls} placeholder="Author full name" />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Language *</label>
            <select name="language" defaultValue="km" className={inputCls}>
              <option value="km">Khmer (ខ្មែរ)</option>
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="zh">Chinese</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">ISBN</label>
            <input name="isbn" className={inputCls} placeholder="978-0-000-00000-0" />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Year</label>
            <input name="year" type="number" min={1900} max={2100} className={inputCls} placeholder={String(new Date().getFullYear())} />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Category</label>
            <input name="category" list="cat-list" className={inputCls} placeholder="e.g. Law, Science…" />
            <datalist id="cat-list">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Department</label>
            <input name="department" className={inputCls} placeholder="e.g. Public Law" />
          </div>
        </div>

        <hr className="border-divider" />

        {/* ── Library-specific ── */}
        <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider">Library Details</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Shelf Location</label>
            <input name="shelf_location" className={inputCls} placeholder="A-3-12" />
            <p className="mt-1 text-[10px] text-text-muted">Default location — can be overridden per copy</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Accession No.</label>
            <input name="accession_number" className={inputCls} placeholder="ACC-001" />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Cover Image URL</label>
            <input 
              name="cover_url" 
              type="url" 
              className={inputCls} 
              placeholder="https://…" 
              onChange={(e) => {
                const val = e.target.value;
                const match = val.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
                if (match) {
                  e.target.value = `https://lh3.googleusercontent.com/d/${match[1]}`;
                }
              }}
            />
            <p className="mt-1 text-[10px] text-text-muted">Leave blank for auto-generated cover</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Description</label>
          <textarea name="description" rows={4} className={inputCls + " resize-none"} placeholder="Brief description of the book…" />
        </div>

        <div>
          <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
            Keywords / Tags (ពាក្យគន្លឺះ)
          </label>
          <TagInput
            name="keywords"
            placeholder="e.g. ច្បាប់, law, reference…"
            disabled={loading}
          />
          <p className="mt-1 text-[10px] text-text-muted">
            ចុច Enter ឬ , ដើម្បីបន្ថែម tag
          </p>
        </div>

        {/* Hidden fields — trigger will set counts from catalog_copies; pass 0 as initial */}
        <input type="hidden" name="copies_total" value="0" />
        <input type="hidden" name="copies_available" value="0" />

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/admin/catalogs"
            className="rounded-xl border border-divider px-5 py-2.5 text-sm font-semibold text-text-body transition hover:bg-paper"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-gradient-to-br from-blue-950 to-brand px-8 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(0,124,145,0.3)] transition hover:shadow-[0_6px_24px_rgba(0,124,145,0.45)] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : "Save Book & Add Copies"}
          </button>
        </div>
      </form>
    </div>
  );
}
