import { redirect } from "next/navigation";
import { EBOOKS_DUPLICATES_PATH } from "@/lib/admin/ebooks-url";
import { withForwardedQuery } from "@/lib/admin/legacy-redirect";

/** Legacy route → /admin/books/duplicates, preserving confidence/signal/sort
 *  filters and the page number. */
export default async function LegacyDuplicatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(withForwardedQuery(EBOOKS_DUPLICATES_PATH, await searchParams));
}
