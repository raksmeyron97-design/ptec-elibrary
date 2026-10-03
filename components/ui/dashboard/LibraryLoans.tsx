"use client";
// components/ui/dashboard/LibraryLoans.tsx
// The reader's own Koha loans and holds (Koha Phase 7/8, docs/KOHA-PATRONS.md).
// Loaded after the page, from /api/me/library-loans, so a slow or unreachable
// Koha never holds up the dashboard. A failed read says so — it never renders
// "nothing on loan". With online renewals on (Phase 10.1,
// docs/KOHA-READER-SERVICES.md) a loan Koha would renew carries a Renew
// button, and one it would not carries Koha's reason instead; returns stay at
// the desk. With online holds on (Phase 10.2) a hold not yet found can be
// cancelled, and one waiting on the hold shelf can be ASKED to be cancelled —
// the desk confirms, because the copy was already pulled for this reader.
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BookMarked, ExternalLink, Library } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/core/Badge";
import { CARD, CardHeader, EmptyState } from "@/components/ui/dashboard/primitives";
import {
  holdMessageKey, renewalMessageKey, type HoldResult, type HoldState, type MyHold, type MyLibrary, type MyLoan, type RenewResult,
} from "@/lib/dashboard/library-loans";
import { cancelLibraryHold, renewLibraryLoan } from "@/app/actions/library-loans";
import { KOHA_OPAC_ACCOUNT_URL } from "@/lib/opac/links";

/** Where one hold's cancellation stands on this screen: asking "are you sure?", sending, or answered. */
type HoldUi = { phase: "confirm" } | { phase: "sending" } | { phase: "done"; result: HoldResult };

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

const ACTION_BASE =
  "inline-flex min-h-10 shrink-0 items-center rounded-xl border px-3 text-[12.5px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 sm:min-h-8 sm:rounded-lg";
const ACTION_CLASS = `${ACTION_BASE} border-divider bg-bg-surface text-text-body hover:border-brand/40 hover:text-brand`;
const DANGER_ACTION_CLASS = `${ACTION_BASE} border-danger-line bg-danger-soft text-danger-text`;

export default function LibraryLoans() {
  const t = useTranslations("dashboard");
  const tNav = useTranslations("nav");
  const locale = useLocale();
  const [data, setData] = useState<MyLibrary | "loading">("loading");
  // Per loan: being sent, or what pressing Renew did — shown in place of the button.
  const [renewUi, setRenewUi] = useState<Record<number, "sending" | RenewResult>>({});
  const setRenew = (id: number, ui: "sending" | RenewResult | null) =>
    setRenewUi((all) => {
      const next = { ...all };
      if (ui) next[id] = ui;
      else delete next[id];
      return next;
    });
  // Holds: one state per hold, so "asking", "sending" and "answered" can never disagree.
  const [holdUi, setHoldUi] = useState<Record<number, HoldUi>>({});
  // Where focus goes when the "are you sure?" opens (its safe answer) and when it closes (the button that opened it).
  const holdTriggerMap = useRef<Map<number, HTMLButtonElement> | null>(null);
  const holdTriggers = () => (holdTriggerMap.current ??= new Map<number, HTMLButtonElement>());
  const keepRef = useRef<HTMLButtonElement>(null);
  const setHold = (id: number, ui: HoldUi | null) =>
    setHoldUi((all) => {
      const next = { ...all };
      if (ui) next[id] = ui;
      else delete next[id];
      return next;
    });
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
    setRenew(loan.id, "sending");
    startTransition(async () => {
      let result: RenewResult;
      try {
        result = await renewLibraryLoan(loan.id);
      } catch {
        result = { status: "unavailable" };
      }
      setRenew(loan.id, result);
      if (result.status === "renewed") {
        setData((d) => d !== "loading" && d.state === "ok"
          ? { ...d, loans: d.loans.map((l) => (l.id === loan.id ? { ...l, dueDate: result.dueDate, renewals: result.renewals, overdue: false } : l)) }
          : d);
      }
    });
  };

  /** "Are you sure?" for one hold at a time. The button pressed leaves the page, so focus moves to the safe answer. */
  const askCancel = (id: number) => {
    setHoldUi((all) => ({ ...Object.fromEntries(Object.entries(all).filter(([, u]) => u.phase !== "confirm")), [id]: { phase: "confirm" } }));
    requestAnimationFrame(() => keepRef.current?.focus());
  };
  const keepHold = (id: number) => {
    setHold(id, null);
    requestAnimationFrame(() => holdTriggers().get(id)?.focus());
  };

  const cancelHold = (hold: MyHold) => {
    setHold(hold.id, { phase: "sending" });
    startTransition(async () => {
      let result: HoldResult;
      try {
        result = await cancelLibraryHold(hold.id);
      } catch {
        result = { status: "unavailable" };
      }
      setHold(hold.id, { phase: "done", result });
      if (result.status === "cancellation_requested") {
        setData((d) => d !== "loading" && d.state === "ok"
          ? { ...d, holds: d.holds.map((h) => (h.id === hold.id ? { ...h, cancellationRequested: true } : h)) }
          : d);
      }
    });
  };

  /** "Couldn't confirm" a hold cancellation: read again, never send again blind. */
  const checkHoldAgain = (holdId: number) => {
    setHold(holdId, null);
    load();
  };

  /** "Couldn't confirm": read again — never press Renew again blind. */
  const checkAgain = (loanId: number) => {
    setRenew(loanId, null);
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
    const ui = renewUi[l.id];
    const done = ui && ui !== "sending" ? ui : null;
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
          disabled={ui === "sending"}
          aria-label={t("renewAria", { title: l.title ?? t("loanUntitled") })}
          className={ACTION_CLASS}
        >
          {ui === "sending" ? t("renewing") : t("renewButton")}
        </button>
      </div>
    );
  };

  /** Below a hold: what cancelling did, the "are you sure?", or the button — only while holds are online. */
  const holdAction = (h: MyHold, online: boolean) => {
    const ui = holdUi[h.id];
    const done = ui?.phase === "done" ? ui.result : null;
    if (done && done.status !== "cancellation_requested") {
      const msg = done.status === "cancelled" ? t("holdCancelled")
        : done.status === "refused" ? t(holdMessageKey(done.code))
        : done.status === "unconfirmed" ? t("holdCancelUnconfirmed")
        : done.status === "not_found" ? t("holdCancelGone")
        : done.status === "rate_limited" ? t("holdRateLimited")
        : t("holdCancelUnavailable");
      return (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p role="status" className={`text-[12px] ${done.status === "cancelled" ? "text-success-text" : "text-text-muted"}`}>{msg}</p>
          {done.status === "unconfirmed" && (
            <button type="button" onClick={() => checkHoldAgain(h.id)} className={ACTION_CLASS}>{t("renewCheckAgain")}</button>
          )}
        </div>
      );
    }
    if (h.cancellationRequested) {
      return <p role={done ? "status" : undefined} className="mt-1 text-[12px] text-text-muted">{t("holdCancelRequested")}</p>;
    }
    // In transit or being processed: nothing the reader can do online (the desk note says where).
    if (!online || (h.state !== "pending" && h.state !== "waiting")) return null;
    const waiting = h.state === "waiting";
    if (ui?.phase === "confirm") {
      return (
        <div className="mt-2 rounded-xl border border-divider bg-paper px-3 py-2.5">
          <p className="text-[12.5px] text-text-body">{waiting ? t("holdAskCancelConfirm") : t("holdCancelConfirm")}</p>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button ref={keepRef} type="button" onClick={() => keepHold(h.id)} className={ACTION_CLASS}>{t("holdKeep")}</button>
            <button type="button" onClick={() => cancelHold(h)} className={DANGER_ACTION_CLASS}>
              {waiting ? t("holdAskCancelButton") : t("holdCancelButton")}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-2">
        <button
          type="button"
          ref={(el) => { if (el) holdTriggers().set(h.id, el); else holdTriggers().delete(h.id); }}
          onClick={() => askCancel(h.id)}
          disabled={ui?.phase === "sending"}
          aria-label={t(waiting ? "holdAskCancelAria" : "holdCancelAria", { title: h.title ?? t("loanUntitled") })}
          className={ACTION_CLASS}
        >
          {ui?.phase === "sending" ? t("holdCancelling") : waiting ? t("holdAskCancelButton") : t("holdCancelButton")}
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
      <CardHeader
        id="library-loans-heading"
        title={t("libraryLoans")}
        icon={Library}
        meta={meta}
        action={
          // The reader's whole account is in the Koha OPAC; this panel shows
          // current loans and holds only. A plain link: shown in
          // every state, including "unavailable", because the OPAC may still
          // answer when this panel's read did not.
          <a
            href={KOHA_OPAC_ACCOUNT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-[12.5px] font-semibold text-brand underline-offset-4 hover:underline sm:min-h-8"
          >
            {t("loansFullAccount")}
            <span className="sr-only"> {t("loansFullAccountWhere")} ({tNav("opensNewTab")})</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </a>
        }
      />

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
                  <li key={h.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0" dir="auto">
                        <ItemTitle item={h} untitled={t("loanUntitled")} />
                        <p className="mt-0.5 truncate text-[12px] text-text-muted">
                          {h.state === "waiting" && h.expirationDate ? t("holdCollectBy", { date: day(h.expirationDate) })
                            : h.state === "pending" && h.priority ? t("holdQueue", { n: h.priority })
                            : day(h.holdDate)}
                        </p>
                      </div>
                      <Badge variant={h.suspended ? "warning" : HOLD_VARIANT[h.state]} className="shrink-0">{holdLabel(h)}</Badge>
                    </div>
                    {holdAction(h, data.holdsOnline === true)}
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
