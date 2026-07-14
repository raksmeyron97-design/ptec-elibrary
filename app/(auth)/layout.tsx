import IntlProvider from "@/components/providers/IntlProvider";
import RootShell from "@/components/layout/RootShell";
import { getMessages } from "next-intl/server";
import { pickMessages, AUTH_NAMESPACES } from "@/i18n/pick-messages";
import { getLocaleFromCookie } from "@/lib/locale";
import { rootMetadata, rootViewport } from "@/app/root-metadata";

export const metadata = rootMetadata;
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
