"use client";

// Preview-only context wrapper for the design-sync cards.
// ThemeToggle calls useTranslations("nav") for its aria-label, which throws
// outside a NextIntlClientProvider. The two strings mirror messages/en.json
// → nav.switchToDark / nav.switchToLight (inlined: the full en.json is 260 KB
// and only these two keys are read by any synced component).
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

const messages = {
  nav: {
    switchToDark: "Switch to dark theme",
    switchToLight: "Switch to light theme",
  },
};

export function PreviewIntlProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" timeZone="Asia/Phnom_Penh" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
