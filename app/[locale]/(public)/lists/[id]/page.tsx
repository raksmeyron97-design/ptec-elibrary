import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { Globe, Lock, BookMarked, ArrowLeft } from "lucide-react";
import { getReadingList } from "@/app/actions/reading-lists";
import { createClient } from "@/lib/supabase/server";
import BookCover from "@/components/ui/books/BookCover";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ReadingListPage({ params }: Props) {
  const { id } = await params;
  const result = await getReadingList(id);
  if (!result) notFound();

  const { list, books } = result;

  // Verify access: public lists are open; private lists require ownership
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!list.is_public && list.user_id !== user?.id) notFound();

  return (
    <section className="min-h-screen bg-bg-body px-4 py-8 sm:px-6 md:px-12">
      <div className="mx-auto max-w-[1000px]">
        {/* Back */}
        <Link href="/dashboard"
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-muted hover:text-brand transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        {/* Header */}
        <div className="mb-8 rounded-2xl border border-divider bg-bg-surface p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/10">
              <BookMarked className="h-6 w-6 text-brand" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-khmer-serif text-[24px] font-bold text-text-heading">{list.name}</h1>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  list.is_public
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-paper text-text-muted border border-divider"
                }`}>
                  {list.is_public ? <><Globe className="h-3 w-3" /> Public</> : <><Lock className="h-3 w-3" /> Private</>}
                </span>
              </div>
              {list.description && (
                <p className="mt-1.5 text-[14px] text-text-muted">{list.description}</p>
              )}
              <p className="mt-2 text-[12px] text-text-muted">
                {books.length} book{books.length !== 1 ? "s" : ""} ·{" "}
                Created {new Date(list.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>
        </div>

        {/* Books grid */}
        {books.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface py-16 text-center">
            <BookMarked className="mb-3 h-10 w-10 text-text-muted/30" />
            <p className="text-[14px] font-semibold text-text-muted">No books in this list yet</p>
            <Link href="/books"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-hover">
              Browse Books
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((item) => {
              const book = item.books;
              if (!book) return null;
              return (
                <Link key={item.id} href={`/books/${book.slug}`}
                  className="group overflow-hidden rounded-[16px] border border-divider bg-bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="aspect-[3/4] w-full overflow-hidden">
                    {book.cover_url ? (
                      <Image
                        src={book.cover_url}
                        alt={book.title}
                        width={200}
                        height={267}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <BookCover
                        title={book.title}
                        label={book.categories?.name ?? ""}
                        author={book.authors?.name ?? ""}
                        variant="card"
                      />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-[12.5px] font-semibold text-text-heading group-hover:text-brand transition-colors">
                      {book.title}
                    </p>
                    {book.authors?.name && (
                      <p className="mt-0.5 truncate text-[11px] text-text-muted">{book.authors.name}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
