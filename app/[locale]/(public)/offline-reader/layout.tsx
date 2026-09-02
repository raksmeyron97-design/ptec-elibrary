import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "@/lib/seo/indexing";

// Device-local reading surface for a book the visitor already downloaded.
// Never indexable: the page is meaningless without that device's storage, and
// the id in the query string is not a public address for anything.
export const metadata: Metadata = { robots: NOINDEX_ROBOTS };

export default function OfflineReaderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
