"use client"
 
;
/* eslint-disable @typescript-eslint/no-explicit-any */


import { useState } from "react";
import Link from "next/link";
import { updateCatalogBook } from "../../actions";
import type { CatalogBook } from "@/lib/catalog";
import CopiesManager from "../../CopiesManager";

interface BookData {
  id: string;
  slug: string;
  title: string;
  author: string;
  shelf_location: string | null;
  accession_number: string | null;
}

export default function EditBookWizard({
  book,
  categories,
}: {
  book: CatalogBook;
  categories: string[];
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [currentBook, setCurrentBook] = useState<BookData>({
    id: book.id,
    slug: book.slug,
    title: book.title,
    author: book.author,
    shelf_location: book.shelf_location,
    accession_number: book.accession_number,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateWithId = updateCatalogBook.bind(null, book.id);

  async function handleUpdateBook(formData: FormData) {
    setError(null);
    setLoading(true);

    try {
      const result = await updateWithId(formData);
      if (result && result.success && result.book) {
        setCurrentBook({
          ...result.book,
          title: formData.get("title") as string,
          author: formData.get("author") as string,
        });
        setStep(2);
      } else {
        setError(result?.error || "Failed to update book.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  const labelCls = "block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5";
  const inputCls = `
    w-full rounded-xl border border-divider bg-paper/50
    px-3.5 py-2.5 text-sm text-text-heading placeholder:text-text-muted
    outline-none transition
    focus:border-brand/50 focus:bg-bg-surface focus:ring-2 focus:ring-focus-ring/15
  `;

  if (step === 2) {
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
            <button type="button" onClick={() => setStep(1)}
              className="flex items-center gap-2 hover:opacity-80 transition"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">✓</span>
              <span className="text-sm font-semibold text-text-muted">Book Info</span>
            </button>
            <div className="h-px w-8 bg-paper" />
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">2</span>
              <span className="text-sm font-bold text-text-body">Physical Copies</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-text-heading">Manage Physical Copies</h1>

          {/* Book summary pill */}
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-divider bg-bg-surface px-3 py-1.5 shadow-sm">
            <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            <span className="text-xs font-semibold text-text-body">{currentBook.title}</span>
            <span className="text-xs text-text-muted">· {currentBook.author}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-divider bg-bg-surface p-6 shadow-sm">
          <p className="text-sm text-text-body mb-4">
            Click the button below to manage all physical copies associated with this book. You can add new copies, change their status, or delete existing ones.
          </p>
          <CopiesManager bookId={currentBook.id} bookShelfLocation={currentBook.shelf_location} />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4">
          <Link
            href="/admin/catalogs"
            className="rounded-xl bg-gradient-to-br from-blue-950 to-brand px-8 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(0,124,145,0.3)] transition hover:shadow-[0_6px_24px_rgba(0,124,145,0.45)] active:scale-[0.98]"
          >
            Finish Editing
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/catalogs" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-brand transition mb-3">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M19 12H5m0 0 7 7m-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to catalogue admin
        </Link>
        <h1 className="text-2xl font-bold text-text-heading">Edit Book</h1>
        <p className="text-sm text-text-muted mt-1 truncate">{book.title}</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 font-semibold">
          {error}
        </div>
      )}

      <form action={handleUpdateBook} className="rounded-2xl bg-bg-surface border border-divider shadow-sm p-6 space-y-5">

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Title *</label>
            <input name="title" required defaultValue={book.title} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Author *</label>
            <input name="author" required defaultValue={book.author} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Language *</label>
            <select name="language" defaultValue={book.language} className={inputCls}>
              <option value="km">Khmer (ខ្មែរ)</option>
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="zh">Chinese</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>ISBN</label>
            <input name="isbn" defaultValue={book.isbn ?? ""} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Publisher</label>
            <input name="publisher" defaultValue={book.publisher ?? ""} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Year</label>
            <input name="year" type="number" min={1900} max={2100} defaultValue={book.year ?? ""} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Category</label>
            <input name="category" list="cat-list" defaultValue={book.category ?? ""} className={inputCls} />
            <datalist id="cat-list">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div>
            <label className={labelCls}>Department</label>
            <input name="department" defaultValue={book.department ?? ""} className={inputCls} />
          </div>
        </div>

        <hr className="border-divider" />
        <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider">Library Details</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Shelf Location</label>
            <input name="shelf_location" defaultValue={book.shelf_location ?? ""} className={inputCls} placeholder="A-3-12" />
          </div>
          <div>
            <label className={labelCls}>Total Copies *</label>
            <input name="copies_total" type="number" min={1} required defaultValue={book.copies_total} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Accession No.</label>
            <input name="accession_number" defaultValue={book.accession_number ?? ""} className={inputCls} />
          </div>
        </div>

        {/* Cover URL */}
        <div>
          <label className={labelCls}>Cover Image URL</label>
          {book.cover_url && (
            <div className="mb-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={book.cover_url} alt="" className="h-16 w-12 object-cover rounded-lg border border-divider" />
              <span className="text-xs text-text-muted truncate max-w-[200px]">{book.cover_url}</span>
            </div>
          )}
          <input 
            name="cover_url" 
            type="url" 
            defaultValue="" 
            className={inputCls} 
            placeholder="New URL (leave blank to keep existing) or type __remove__ to clear" 
            onChange={(e) => {
              const val = e.target.value;
              const match = val.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
              if (match) {
                e.target.value = `https://lh3.googleusercontent.com/d/${match[1]}`;
              }
            }}
          />
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <textarea name="description" rows={4} defaultValue={book.description ?? ""} className={inputCls + " resize-none"} />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/admin/catalogs" className="rounded-xl border border-divider px-5 py-2.5 text-sm font-semibold text-text-body hover:bg-paper transition">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-gradient-to-br from-blue-950 to-brand px-8 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(0,124,145,0.3)] transition hover:shadow-[0_6px_24px_rgba(0,124,145,0.45)] active:scale-[0.98] disabled:opacity-70"
          >
            {loading ? "Saving..." : "Save Changes & Manage Copies"}
          </button>
        </div>
      </form>
    </div>
  );
}
