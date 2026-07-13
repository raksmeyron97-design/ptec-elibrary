import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AskWidget from "@/components/ui/ask/AskWidget";
import IntlProvider from "@/components/providers/IntlProvider";
import { getLocale, getMessages } from "next-intl/server";
import { pickMessages, PUBLIC_NAMESPACES } from "@/i18n/pick-messages";
import { hasSessionCookie } from "@/lib/auth/session";

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [locale, allMessages, maybeLoggedIn] = await Promise.all([
    getLocale(),
    getMessages(),
    // Cookie presence only — the widget hint must not block first byte on a
    // Supabase auth round-trip; the ask API verifies the user for real.
    hasSessionCookie(),
  ]);
  const messages = pickMessages(allMessages, PUBLIC_NAMESPACES);

  return (
    <IntlProvider locale={locale} messages={messages}>
      <div className="flex min-h-screen flex-col overflow-x-clip pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Navbar />
        <main id="main-content" className="flex-grow">{children}</main>
        <Footer />
        <AskWidget isLoggedIn={maybeLoggedIn} />
      </div>
    </IntlProvider>
  );
}
