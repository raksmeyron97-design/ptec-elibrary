"use client";
// components/ui/dashboard/LibraryLoans.tsx
// The reader's own Koha loans and holds (Koha Phase 7/8, docs/KOHA-PATRONS.md).
// Loaded after the page, from /api/me/library-loans, so a slow or unreachable
// Koha never holds up the dashboard. Read-only: renewals and returns happen at
// the library desk. A failed read says so — it never renders "nothing on loan".
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BookMarked, Library } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/core/Badge";
import { CARD, CardHeader, EmptyState } from "@/components/ui/dashboard/primitives";
import type { HoldState, MyHold, MyLibrary, MyLoan } from "@/lib/dashboard/library-loans";

const HOLD_VARIANT: Record<HoldState, "success" | "info" | "warning"> = {
  waiting: "success", in_transit: "info", processing: "info", pending: "warning",
};

function ItemTitle({ item, untitled }: { item: Pick<MyLoan, "title" | "slug">; untitled: string }) {
  return item.slug ? (
    <Link href={`/catalogs/${item.slug}`} className="line-clamp-2 text-[13.5px] font-semibold text-text-heading hover:text-brand">{item.title}</Link>
  ) : (
    <span className="line-clamp-2 text-[13.5px] font-semibold text-text-heading">{item.title ?? untitled}</span>
  );
}

export default function LibraryLoans() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [data, setData] = useState<MyLibrary | "loading">("loading");

  useEffect(() => {
    let live = true;
    fetch("/api/me/library-loans", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { state: "unavailable", cardHint: null }))
      .then((d: MyLibrary) => { if (live) setData(d); })
      .catch(() => { if (live) setData({ state: "unavailable", cardHint: null }); });
    return () => { live = false; };
  }, []);

  // The library's day, not the device's: a loan due 23:59 in Phnom Penh is due that day wherever the phone is set.
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Phnom_Penh" }),
    [locale],
  );

  if (data !== "loading" && data.state === "off") return null;

  const day = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "—");
  const meta = data !== "loading" && (data.state === "ok" || data.state === "unavailable") && data.cardHint
    ? t("loansMeta", { card: data.cardHint }) : undefined;

  const holdLabel = (h: MyHold) =>
    h.suspended ? t("holdSuspended")
      : h.state === "waiting" ? t("holdWaiting")
      : h.state === "in_transit" ? t("holdTransit")
      : h.state === "processing" ? t("holdProcessing")
      : t("holdPending");

  return (
    <section aria-labelledby="library-loans-heading" aria-busy={data === "loading"} className={CARD}>
      <CardHeader id="library-loans-heading" title={t("libraryLoans")} icon={Library} meta={meta} />

      {data === "loading" ? (
        <p className="border-t border-divider px-5 py-4 text-[13px] text-text-muted">{t("loansLoading")}</p>
      ) : data.state === "unlinked" ? (
        <EmptyState compact icon={BookMarked} title={t("loansUnlinkedTitle")} description={t("loansUnlinkedDesc")} />
      ) : data.state === "unavailable" ? (
        <p role="status" className="border-t border-divider px-5 py-4 text-[13px] text-warning-text">{t("loansUnavailable")}</p>
      ) : (
        <div className="border-t border-divider">
          <h3 className="px-5 pt-3 text-[12px] font-semibold uppercase tracking-wide text-text-muted">{t("loansHeading")}</h3>
          {data.loans.length === 0 ? (
            <p className="px-5 py-3 text-[13px] text-text-muted">{t("noLoans")}</p>
          ) : (
            <ul className="divide-y divide-divider">
              {data.loans.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0" dir="auto">
                    <ItemTitle item={l} untitled={t("loanUntitled")} />
                    <p className="mt-0.5 truncate text-[12px] text-text-muted">
                      {t("loanDue", { date: day(l.dueDate) })}
                      {l.renewals > 0 && <> · {t("loanRenewals", { n: l.renewals })}</>}
                      {l.barcode && <> · {t("loanBarcode", { code: l.barcode })}</>}
                    </p>
                  </div>
                  {l.overdue && <Badge variant="danger" className="shrink-0">{t("loanOverdue")}</Badge>}
                </li>
              ))}
            </ul>
          )}

          {data.holds.length > 0 && (
            <>
              <h3 className="border-t border-divider px-5 pt-3 text-[12px] font-semibold uppercase tracking-wide text-text-muted">{t("holdsHeading")}</h3>
              <ul className="divide-y divide-divider">
                {data.holds.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0" dir="auto">
                      <ItemTitle item={h} untitled={t("loanUntitled")} />
                      <p className="mt-0.5 truncate text-[12px] text-text-muted">
                        {h.state === "waiting" && h.expirationDate ? t("holdCollectBy", { date: day(h.expirationDate) })
                          : h.state === "pending" && h.priority ? t("holdQueue", { n: h.priority })
                          : day(h.holdDate)}
                      </p>
                    </div>
                    <Badge variant={h.suspended ? "warning" : HOLD_VARIANT[h.state]} className="shrink-0">{holdLabel(h)}</Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="border-t border-divider px-5 py-3 text-[12px] text-text-muted">{t("loansDeskNote")}</p>
        </div>
      )}
    </section>
  );
}
