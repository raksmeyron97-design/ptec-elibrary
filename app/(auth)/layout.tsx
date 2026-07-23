import IntlProvider from "@/components/providers/IntlProvider";
import RootShell from "@/components/layout/RootShell";
import { getMessages } from "next-intl/server";
import { pickMessages, AUTH_NAMESPACES } from "@/i18n/pick-messages";
import { getLocaleFromCookie } from "@/lib/locale";
import { identityMetadata, rootViewport } from "@/app/root-metadata";
import { NOINDEX_ROBOTS } from "@/lib/seo/indexing";

// Auth flows are private surfaces: never indexable, in any environment.
// robots.txt already disallows /auth, but a disallow alone does not prevent
// indexing of externally-linked URLs — the meta tag does.
export async function generateMetadata() {
  return { ...(await identityMetadata()), robots: NOINDEX_ROBOTS };
}
export const viewport = rootViewport;

// Root layout for the auth flows. Like the admin panel these live outside the
// locale-prefixed tree, so the locale comes from the cookie; these routes read
// and write the session and are dynamic by nature.
export default async function AuthRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocaleFromCookie();
  const messages = pickMessages(await getMessages({ locale }), AUTH_NAMESPACES);

  return (
    <RootShell locale={locale}>
      <IntlProvider locale={locale} messages={messages}>
        {children}
      </IntlProvider>
    </RootShell>
  );
}
