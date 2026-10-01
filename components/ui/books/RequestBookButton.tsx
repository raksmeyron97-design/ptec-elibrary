"use client";

// "Request a book" on /books and on an empty /catalogs search (SEO decision
// P6-2). It is the homepage's ContributeDialog — a native <dialog>, so the
// page behind it is inert and focus is trapped — rather than the hand-rolled
// modal these pages used to carry, which left the page behind it readable to
// assistive technology. One form, one set of strings, one submit path.

import { useTranslations } from "next-intl";
import ContributeDialog from "@/components/ui/home/ContributeDialog";

const TRIGGER =
  "focus-field inline-flex items-center gap-2 rounded-[12px] border border-divider bg-paper px-4 py-2.5 " +
  "text-[13px] font-semibold text-text-body outline-none transition-colors hover:border-brand/50 hover:text-brand";

export default function RequestBookButton() {
  const t = useTranslations("home");
  return <ContributeDialog kind="acquisition" triggerClassName={TRIGGER} triggerLabel={t("growRequestTitle")} />;
}
