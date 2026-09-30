"use client";

import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { openThesisReader } from "@/lib/theses/reader-bus";

/**
 * "Read online" — the one control on the record page that opens the in-page
 * reader, from wherever it is drawn (the access panel, the phone dock).
 *
 * It decides nothing: callers render it only when the viewer's access says
 * `canRead`, which is the file route's own inline rule (lib/theses/access.ts),
 * and the Full text section mounts the viewer only on the same condition.
 */
export default function ReadOnlineButton({ className }: { className: string }) {
  const t = useTranslations("thesisDetail");
  return (
    <button type="button" onClick={() => openThesisReader()} className={className}>
      <BookOpen aria-hidden="true" />
      {t("readOnline")}
    </button>
  );
}
