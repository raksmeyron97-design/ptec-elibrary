import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AskWidget from "@/components/ui/ask/AskWidget";
import AnnouncementBanner from "@/components/ui/notifications/AnnouncementBanner";
import IntlProvider from "@/components/providers/IntlProvider";
import SessionProvider from "@/components/providers/SessionProvider";
import { setRequestLocale, getMessages } from "next-intl/server";
import { pickMessages, PUBLIC_NAMESPACES } from "@/i18n/pick-messages";
import { getActiveBannerAnnouncements } from "@/lib/announcements-public";

// Nothing in this layout may touch cookies() or headers(). The whole public
// tree is prerendered and served from the CDN, and a single dynamic API call
// here opts every public route back into per-request rendering — which is
// exactly what the old hasSessionCookie() call did. The viewer's identity is
// loaded client-side by <SessionProvider> instead (app/api/me/route.ts).
//
// getActiveBannerAnnouncements() is safe here too: it's a cached (unstable_cache,
// tag "announcement-banner") service-role read with no cookies/headers, same
// pattern as getSiteConfig() — the page stays prerenderable/ISR.
export default async function PublicLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [messages, banners] = await Promise.all([
    getMessages({ locale }).then((m) => pickMessages(m, PUBLIC_NAMESPACES)),
    getActiveBannerAnnouncements(locale),
  ]);

  return (
    <IntlProvider locale={locale} messages={messages}>
      <SessionProvider>
        <div className="flex min-h-screen flex-col overflow-x-clip pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <Navbar />
          {banners.length > 0 && <AnnouncementBanner announcements={banners} />}
          <main id="main-content" className="flex-grow">{children}</main>
          <Footer />
          <AskWidget />
        </div>
      </SessionProvider>
    </IntlProvider>
  );
}
