import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "@/lib/seo/indexing";

// Reading lists are user-generated content (public ones are shareable by
// link) — never indexable, in any environment.
export const metadata: Metadata = { robots: NOINDEX_ROBOTS };

export default function ListsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
