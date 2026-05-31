// app/admin/catalogs/add-copies/[bookId]/page.tsx
// Step 2: After a book is created, the admin lands here to add physical copies.
// Each copy row gets: Barcode, Call Number, Shelf Location, Holding Library, Status.

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import AddCopiesClient from "./AddCopiesClient";

export const dynamic = "force-dynamic";

export default async function AddCopiesPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect(`/auth/login?callbackUrl=/admin/catalogs/add-copies/${bookId}`);

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/catalogs");

  // Load the just-created book
  const { data: book } = await supabase
    .from("catalog_books")
    .select("id, title, author, slug, shelf_location, accession_number, copies_total")
    .eq("id", bookId)
    .single();

  if (!book) notFound();

  return (
    <section className="min-h-screen bg-paper px-4 py-8 md:px-12">
      <div className="mx-auto max-w-[820px] space-y-6">

        {/* Header */}
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

        {/* Client component handles all the interactive copy-adding UI */}
        <AddCopiesClient
          bookId={book.id}
          bookSlug={book.slug}
          defaultShelfLocation={book.shelf_location ?? ""}
          defaultAccession={book.accession_number ?? ""}
        />
      </div>
    </section>
  );
}