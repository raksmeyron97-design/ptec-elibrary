import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "@/lib/seo/indexing";

// Device-local downloaded books: personal surface, never indexable (the page
// itself is a client component, so robots metadata lives on this layout).
export const metadata: Metadata = { robots: NOINDEX_ROBOTS };

export default function OfflineBooksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
