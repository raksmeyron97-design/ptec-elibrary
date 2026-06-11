'use client';

import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';

type Props = {
  locale: string;
  messages: AbstractIntlMessages;
  children: React.ReactNode;
};

export default function IntlProvider({ locale, messages, children }: Props) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Phnom_Penh">
      {children}
    </NextIntlClientProvider>
  );
}
