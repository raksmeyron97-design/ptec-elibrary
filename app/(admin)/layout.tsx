import AdminThemeEnforcer from "@/components/layout/AdminThemeEnforcer";
import RootShell from "@/components/layout/RootShell";
import { getLocaleFromCookie } from "@/lib/locale";
import { identityMetadata, rootViewport } from "@/app/root-metadata";
import { NOINDEX_ROBOTS } from "@/lib/seo/indexing";
import "@/app/admin.css";

// The admin panel is a private surface: never indexable, in any environment
// (the /admin/login page is publicly reachable and would otherwise inherit
// rootMetadata's environment-dependent robots).
export async function generateMetadata() {
  return { ...(await identityMetadata()), robots: NOINDEX_ROBOTS };
}
export const viewport = rootViewport;

// Root layout for the admin panel. Admin routes are outside the locale-prefixed
// tree, so the locale comes from the cookie — a dynamic API, which is fine
// here: every admin route is session-gated and dynamically rendered anyway, and
// middleware serves this subtree the nonce CSP (lib/csp.ts).
export default async function AdminRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocaleFromCookie();

  return (
    <RootShell locale={locale}>
      <AdminThemeEnforcer />
      <div className="theme-light min-h-screen bg-bg-app text-text-body">
        {children}
      </div>
    </RootShell>
  );
}
