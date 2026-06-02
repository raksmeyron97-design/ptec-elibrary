"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/ui/core/Icon";
import { getOfflineBooks, removeOfflineBookMeta, type OfflineBook } from "@/lib/offline";

export default function OfflineBooksPage() {
  const [books, setBooks] = useState<OfflineBook[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setBooks(getOfflineBooks());
    setMounted(true);
  }, []);

  const handleRemove = (id: string) => {
    if (confirm("Are you sure you want to remove this book from offline storage?")) {
      removeOfflineBookMeta(id);
      setBooks(getOfflineBooks());
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-bg-body px-6 py-10 md:px-12">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/books"
          className="mb-6 inline-flex items-center gap-2 text-[14.5px] font-semibold text-brand transition-colors hover:text-brand-hover"
        >
          <Icon name="arrow-left" className="text-[20px]" />
          Back to catalogue
        </Link>
        
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-khmer-serif text-3xl font-bold text-text-heading">
            Saved Offline
          </h1>
          <span className="rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand">
            {books.length} {books.length === 1 ? 'Book' : 'Books'}
          </span>
        </div>

        {books.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-divider bg-bg-surface py-20 text-center shadow-sm">
            <div className="mb-4 rounded-full bg-divider p-5">
              <Icon name="bookmark" className="text-4xl text-text-muted" />
            </div>
            <h2 className="mb-2 font-khmer-serif text-xl font-bold text-text-heading">No books saved for offline</h2>
            <p className="max-w-md text-base text-text-muted">
              You haven't downloaded any books for offline reading yet. Go to any book page and click "Save Offline" to access it without an internet connection.
            </p>
            <Link
              href="/books"
              className="mt-6 rounded-[12px] bg-brand px-6 py-3 font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              Browse Books
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((book) => (
              <div key={book.id} className="group relative flex flex-col overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm transition-all hover:-translate-y-1 hover:border-brand/30 hover:shadow-md">
                <Link href={`/books/${book.slug}`} className="absolute inset-0 z-10">
                  <span className="sr-only">View {book.title}</span>
                </Link>
                
                <div className="relative aspect-[3/4] w-full border-b border-divider/50 bg-paper">
                  {book.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={book.coverUrl}
                      alt={book.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className={`flex h-full w-full flex-col justify-end p-4 ${book.coverColor || "bg-brand"}`}>
                      <h3 className="line-clamp-3 font-khmer-serif text-lg font-bold leading-tight text-white">{book.title}</h3>
                      <p className="mt-1 line-clamp-1 text-sm text-white/80">{book.author}</p>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="line-clamp-2 font-khmer-serif text-[15px] font-bold leading-snug text-text-heading">
                    {book.title}
                  </h3>
                  <p className="mt-1 line-clamp-1 text-xs font-medium text-text-muted">
                    {book.author}
                  </p>
                  
                  <div className="mt-auto pt-4 relative z-20 flex justify-between items-center">
                    <span className="text-[11px] font-medium text-text-muted">
                      Saved {new Date(book.savedAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        handleRemove(book.id);
                      }}
                      className="rounded-md p-1.5 text-danger transition-colors hover:bg-danger/10 hover:text-danger"
                      aria-label="Remove from offline"
                    >
                      <Icon name="trash" className="text-[16px]" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
