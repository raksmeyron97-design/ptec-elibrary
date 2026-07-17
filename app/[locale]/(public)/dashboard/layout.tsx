import type { Metadata } from "next";
import { NOINDEX_ROBOTS } from "@/lib/seo/indexing";

// Account surface: session-gated in middleware, never indexable in any
// environment (second layer above the X-Robots-Tag header).
export const metadata: Metadata = { robots: NOINDEX_ROBOTS };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
