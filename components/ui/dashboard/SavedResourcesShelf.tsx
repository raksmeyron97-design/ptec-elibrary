/* eslint-disable @typescript-eslint/no-explicit-any */
// components/ui/dashboard/SavedResourcesShelf.tsx
// SECONDARY section — a preview of saved books (real `saved_books` rows).
// Full browsing stays in DashboardTabs' Saved panel; "View all" deep-links
// there via ?tab=saved#library.
import { Link } from "@/i18n/navigation";
import { Bookmark } from "lucide-react";
import { getTranslations } from "next-intl/server";
import HorizontalCarousel from "@/components/ui/core/HorizontalCarousel";
import BookCard from "@/components/ui/books/BookCard";

const SHELF_SIZE = 5;

export default async function SavedResourcesShelf({ savedBooks }: { savedBooks: any[] }) {
  const t = await getTranslations("dashboard");
  const shelf = savedBooks.slice(0, SHELF_SIZE);

  return (
    <section aria-label={t("savedHeading")}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-text-heading">{t("savedHeading")}</h2>
        {savedBooks.length > 0 && (
          <Link href="/dashboard?tab=saved#library" className="focus-field rounded text-[12.5px] font-semibold text-brand hover:underline">
            {t("viewAll")} →
          </Link>
        )}
      </div>

      {shelf.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-divider bg-bg-surface px-6 py-10 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/8 text-brand" aria-hidden="true">
            <Bookmark className="h-5 w-5" />
          </div>
          <p className="text-[13.5px] font-semibold text-text-heading">{t("noSavedTitle")}</p>
          <p className="mt-1 max-w-xs text-[12.5px] text-text-muted">{t("noSavedDesc")}</p>
          <Link href="/books"
            className="focus-field mt-4 inline-flex h-9 items-center rounded-xl bg-brand px-4 text-[12.5px] font-semibold text-brand-contrast transition hover:bg-brand-hover">
            {t("browseCatalogue")}
          </Link>
        </div>
      ) : (
        <HorizontalCarousel>
          {shelf.map((book) => (
            <div key={book.slug} className="w-[168px] shrink-0 sm:w-[188px]">
              <BookCard book={{ ...book, format: (book.format ?? "PDF") as "PDF" | "Print" | "Audio" | "Video" }} />
            </div>
          ))}
        </HorizontalCarousel>
      )}
    </section>
  );
}
