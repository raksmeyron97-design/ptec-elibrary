import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Star } from "lucide-react";

import { PageHeader } from "@/components/admin/kit";
import BooksBreadcrumb from "@/components/admin/ebooks/BooksBreadcrumb";
import BooksWorkspaceNav from "@/components/admin/ebooks/BooksWorkspaceNav";
import EbookErrorState from "@/components/admin/ebooks/states/EbookErrorState";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { getFeaturedBooksAdmin } from "@/app/actions/featured-books";
import { ebooksFilterUrl } from "@/lib/admin/ebooks-url";
import FeaturedBooksClient from "./_components/FeaturedBooksClient";

export const dynamic = "force-dynamic";

/**
 * "Featured by PTEC Library" — the editorial shelf at the top of /books.
 *
 * READ, like the collection workspace it belongs to: a `books: read` account
 * sees what the library is promoting, in the order readers see it, and none of
 * the controls that change it. `books.feature` is checked per mutation, in the
 * Server Action and again by the client capability layer for rendering.
 *
 * Books are added from the collection's row menu rather than from a picker
 * here, because a librarian decides to feature a book while looking AT it —
 * a second search UI on this page would be a second place to find the same
 * book, disagreeing with the first about filters and ordering.
 */
export default async function FeaturedBooksPage() {
  const { can } = await requireRouteAccess("books.featured");
  const canCurate = can("books.feature");

  const [t, shelf] = await Promise.all([
    getTranslations("adminEbooks.featured"),
    getFeaturedBooksAdmin().catch(() => null),
  ]);

  return (
    <div className="w-full space-y-6">
      <PageHeader
        breadcrumb={<BooksBreadcrumb current={t("title")} />}
        title={t("title")}
        description={t("description")}
        className="mb-4"
        actions={
          canCurate && shelf && !shelf.unavailable ? (
            <Link
              href={ebooksFilterUrl({ status: "published", verification: "verified" })}
              className="focus-field inline-flex h-9 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3.5 text-sm font-semibold text-text-body transition-colors hover:bg-paper"
            >
              <Star className="h-4 w-4" aria-hidden="true" />
              {t("addFrom")}
            </Link>
          ) : undefined
        }
      />

      <BooksWorkspaceNav current="featured" featuredCount={shelf?.rows.length} />

      {/* Three outcomes, kept apart: the read failed, the columns are not in
          the database yet, and the shelf is simply empty (the client owns the
          last one, because "empty" there is an invitation, not a fault). */}
      {shelf === null ? (
        <EbookErrorState />
      ) : shelf.unavailable ? (
        <p className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning-text">
          {t("migrationMissing")}
        </p>
      ) : (
        <FeaturedBooksClient rows={shelf.rows} />
      )}
    </div>
  );
}
