"use client";

import { useTranslations } from "next-intl";
import AdminErrorState from "@/components/admin/kit/ErrorState";

export default function BooksUploadError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("adminUpload");
  return <AdminErrorState error={error} reset={reset} description={t("loadFailedBody")} />;
}
