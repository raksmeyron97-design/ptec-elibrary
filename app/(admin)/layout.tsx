import AdminThemeEnforcer from "@/components/layout/AdminThemeEnforcer";
import RootShell from "@/components/layout/RootShell";
import { getLocaleFromCookie } from "@/lib/locale";
import { rootMetadata, rootViewport } from "@/app/root-metadata";
import "@/app/admin.css";

export const metadata = rootMetadata;
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
