import IntlProvider from "@/components/providers/IntlProvider";
import { getLocale, getMessages } from "next-intl/server";
import { pickMessages, AUTH_NAMESPACES } from "@/i18n/pick-messages";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [locale, allMessages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <IntlProvider locale={locale} messages={pickMessages(allMessages, AUTH_NAMESPACES)}>
      {children}
    </IntlProvider>
  );
}
