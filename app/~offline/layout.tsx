import RootShell from "@/components/layout/RootShell";
import { identityMetadata, rootViewport } from "@/app/root-metadata";
import { NOINDEX_ROBOTS } from "@/lib/seo/indexing";

// The offline fallback is a service-worker shell, not a page anyone should
// find in search: it was `index, follow` with no canonical (AUDIT N1).
export async function generateMetadata() {
  return { ...(await identityMetadata()), robots: NOINDEX_ROBOTS };
}
export const viewport = rootViewport;

// Root layout for the PWA offline fallback. This page is precached by the
// service worker and shown when the network is gone, so it must not depend on
// cookies or headers for its locale — it is always the default locale.
export default function OfflineRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RootShell locale="en">{children}</RootShell>;
}
