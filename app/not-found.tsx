import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Seal } from "@/components/ui/core/Seal";
import Icon from "@/components/ui/core/Icon";
import { Button } from "@/components/ui/core/Button";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-body px-6 py-16 font-sans">
      <div className="w-full max-w-[560px] text-center">
        <Link href="/home" className="inline-flex items-center justify-center" aria-label="PTEC Library">
          <Seal size={72} />
        </Link>

        <p className="mt-8 text-[13px] font-bold uppercase tracking-[0.18em] text-text-muted">404</p>
        <h1 className="font-khmer-serif mt-2 text-3xl font-bold text-text-heading sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-7 text-text-body">
          {t("body")}
        </p>

        {/* Search the library */}
        <form action="/search" method="GET" className="mx-auto mt-8 flex max-w-md items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
              <Icon name="search" className="text-[16px]" />
            </span>
            <input
              type="text"
              name="q"
              required
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-12 w-full rounded-xl border border-divider bg-bg-surface pl-10 pr-4 text-[15px] text-text-heading placeholder:text-text-muted outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </div>
          <Button type="submit" size="lg" className="shrink-0">
            {t("searchButton")}
          </Button>
        </form>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm font-medium">
          <Link href="/home" className="inline-flex min-h-11 items-center gap-1.5 text-brand hover:underline underline-offset-4">
            <Icon name="arrow-left" className="text-[15px]" />
            {t("goHome")}
          </Link>
          <Link href="/books" className="inline-flex min-h-11 items-center gap-1.5 text-brand hover:underline underline-offset-4">
            <Icon name="library" className="text-[15px]" />
            {t("browseBooks")}
          </Link>
          <Link href="/contact" className="inline-flex min-h-11 items-center gap-1.5 text-brand hover:underline underline-offset-4">
            <Icon name="mail" className="text-[15px]" />
            {t("contact")}
          </Link>
        </div>
      </div>
    </div>
  );
}
