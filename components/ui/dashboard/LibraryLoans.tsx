"use client";
// components/ui/dashboard/LibraryLoans.tsx
// The reader's own Koha loans and holds (Koha Phase 7/8, docs/KOHA-PATRONS.md).
// Loaded after the page, from /api/me/library-loans, so a slow or unreachable
// Koha never holds up the dashboard. A failed read says so — it never renders
// "nothing on loan". With online renewals on (Phase 10.1,
// docs/KOHA-READER-SERVICES.md) a loan Koha would renew carries a Renew
// button, and one it would not carries Koha's reason instead; returns stay at
// the desk.
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BookMarked, Library } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/core/Badge";
import { CARD, CardHeader, EmptyState } from "@/components/ui/dashboard/primitives";
import { renewalMessageKey, type HoldState, type MyHold, type MyLibrary, type MyLoan, type RenewResult } from "@/lib/dashboard/library-loans";
import { renewLibraryLoan } from "@/app/actions/library-loans";

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

const ACTION_CLASS =
  "inline-flex min-h-10 shrink-0 items-center rounded-xl border border-divider bg-bg-surface px-3 text-[12.5px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-wait disabled:opacity-60 sm:min-h-8 sm:rounded-lg";

export default function LibraryLoans() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [data, setData] = useState<MyLibrary | "loading">("loading");
  // What pressing Renew did, per loan — shown in place of the button.
  const [renewed, setRenewed] = useState<Record<number, RenewResult>>({});
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    let live = true;
    fetch("/api/me/library-loans", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { state: "unavailable", cardHint: null }))
      .then((d: MyLibrary) => { if (live) setData(d); })
      .catch(() => { if (live) setData({ state: "unavailable", cardHint: null }); });
    return () => { live = false; };
  }, []);
  useEffect(load, [load]);

  const renew = (loan: MyLoan) => {
    setPendingId(loan.id);
    startTransition(async () => {
      let result: RenewResult;
      try {
        result = await renewLibraryLoan(loan.id);
      } catch {
        result = { status: "unavailable" };
      }
      setRenewed((r) => ({ ...r, [loan.id]: result }));
      if (result.status === "renewed") {
        setData((d) => d !== "loading" && d.state === "ok"
          ? { ...d, loans: d.loans.map((l) => (l.id === loan.id ? { ...l, dueDate: result.dueDate, renewals: result.renewals, overdue: false } : l)) }
          : d);
      }
      setPendingId(null);
    });
  };

  /** "Couldn't confirm": read again — never press Renew again blind. */
  const checkAgain = (loanId: number) => {
    setRenewed((r) => { const next = { ...r }; delete next[loanId]; return next; });
    load();
  };

  // The library's day, not the device's: a loan due 23:59 in Phnom Penh is due that day wherever the phone is set.
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Phnom_Penh" }),
    [locale],
  );

  if (data !== "loading" && data.state === "off") return null;

  const day = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "—");
  const meta = data !== "loading" && (data.state === "ok" || data.state === "unavailable") && data.cardHint
    ? t("loansMeta", { card: data.cardHint }) : undefined;

  const reasonFor = (code: string | null, soonest: string | null) => {
    const key = renewalMessageKey(code);
    if (key === "renewTooSoon") return soonest ? t("renewTooSoon", { date: day(soonest) }) : t("renewTooSoonNoDate");
    return t(key);
  };

  /** The right-hand side of a loan row: its state, or what can be done about it. */
  const loanAction = (l: MyLoan, online: boolean) => {
    const done = renewed[l.id];
    if (done) {
      const msg = done.status === "renewed" ? t("renewedTo", { date: day(done.dueDate) })
        : done.status === "refused" ? reasonFor(done.code, null)
        : done.status === "unconfirmed" ? t("renewUnconfirmed")
        : done.status === "not_found" ? t("renewGone")
        : done.status === "rate_limited" ? t("renewRateLimited")
        : t("renewUnavailable");
      return (
        <div className="flex max-w-[16rem] flex-col items-end gap-1.5 text-right">
          <p role="status" className={`text-[12px] ${done.status === "renewed" ? "text-success-text" : "text-text-muted"}`}>{msg}</p>
          {done.status === "unconfirmed" && (
            <button type="button" onClick={() => checkAgain(l.id)} className={ACTION_CLASS}>{t("renewCheckAgain")}</button>
          )}
        </div>
      );
    }
    if (!online || l.renewal === undefined) return l.overdue ? <Badge variant="danger" className="shrink-0">{t("loanOverdue")}</Badge> : null;
    if (l.renewal && !l.renewal.allowed) {
      return (
        <div className="flex max-w-[16rem] flex-col items-end gap-1 text-right">
          {l.overdue && <Badge variant="danger" className="shrink-0">{t("loanOverdue")}</Badge>}
          <p className="text-[12px] text-text-muted">{reasonFor(l.renewal.code, l.renewal.soonest)}</p>
        </div>
      );
    }
    return (
      <div className="flex shrink-0 items-center gap-2">
        {l.overdue && <Badge variant="danger" className="shrink-0">{t("loanOverdue")}</Badge>}
        <button
          type="button"
          onClick={() => renew(l)}
          disabled={pendingId === l.id}
          aria-label={t("renewAria", { title: l.title ?? t("loanUntitled") })}
          className={ACTION_CLASS}
        >
          {pendingId === l.id ? t("renewing") : t("renewButton")}
        </button>
      </div>
    );
  };

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
                      {l.renewals > 0 && (l.renewal?.max != null
                        ? <> · {t("renewCount", { n: l.renewals, max: l.renewal.max })}</>
                        : <> · {t("loanRenewals", { n: l.renewals })}</>)}
                      {l.barcode && <> · {t("loanBarcode", { code: l.barcode })}</>}
                    </p>
                  </div>
                  {loanAction(l, data.renewalsOnline === true)}
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
          <p className="border-t border-divider px-5 py-3 text-[12px] text-text-muted">{data.renewalsOnline ? t("loansDeskNoteReturns") : t("loansDeskNote")}</p>
        </div>
      )}
    </section>
  );
}
