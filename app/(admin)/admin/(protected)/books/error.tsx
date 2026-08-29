"use client";

import { useTranslations } from "next-intl";
import AdminErrorState from "@/components/admin/kit/ErrorState";

export default function BooksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("adminEbooks.states");
  return <AdminErrorState error={error} reset={reset} description={t("loadFailedBody")} />;
}
