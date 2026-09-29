"use client";
// components/ui/books/CatalogHoldAction.tsx
// "Place a hold" on a Physical Library title (Koha Phase 10.2,
// docs/KOHA-READER-SERVICES.md). Rendered by the page only when holds are on,
// the title is in Koha, and no copy is on the shelf (titleMayBeHeld) — a copy
// on the shelf is borrowed at the desk. The page is prerendered for everyone,
// so what THIS reader may do is asked after it loads, from
// /api/me/library-hold: sign in, link a card, already held or on loan, or the
// button. Koha decides again at the press; its reason is shown if it says no.
import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import NextLink from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { BookmarkPlus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { holdMessageKey, type HoldResult, type TitleHoldStatus } from "@/lib/dashboard/library-loans";
import { placeLibraryHold } from "@/app/actions/library-loans";

const BUTTON =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover disabled:cursor-wait disabled:opacity-70";
const QUIET_LINK = "font-semibold text-brand underline-offset-2 hover:underline";

export default function CatalogHoldAction({ slug }: { slug: string }) {
  const t = useTranslations("catalogs.hold");
  const td = useTranslations("dashboard");
  const locale = useLocale();
  const [status, setStatus] = useState<TitleHoldStatus | "loading">("loading");
  const [result, setResult] = useState<HoldResult | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    let live = true;
    fetch(`/api/me/library-hold?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { state: "unavailable" }))
      .then((d: TitleHoldStatus) => { if (live) setStatus(d); })
      .catch(() => { if (live) setStatus({ state: "unavailable" }); });
    return () => { live = false; };
  }, [slug]);
  useEffect(load, [load]);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Phnom_Penh" }),
    [locale],
  );

  const place = () => {
    startTransition(async () => {
      let r: HoldResult;
      try {
        r = await placeLibraryHold(slug);
      } catch {
        r = { status: "unavailable" };
      }
      setResult(r);
    });
  };

  /** "Couldn't confirm": read what Koha now holds — never press Place again blind. */
  const checkAgain = () => {
    setResult(null);
    setStatus("loading");
    load();
  };

  if (status !== "loading" && status.state === "off") return null;

  const myLibrary = <Link href="/dashboard" className={QUIET_LINK}>{t("seeMyLibrary")}</Link>;
  let body: ReactNode;

  if (status === "loading") {
    // Holds the card's height, so the contact button below does not jump.
    body = <div aria-hidden className="h-11 animate-pulse rounded-xl bg-divider/60" />;
  } else if (result) {
    const ok = result.status === "placed";
    const msg = result.status === "placed" ? (result.priority ? t("placed", { n: result.priority }) : t("placedNoQueue"))
      : result.status === "refused" ? td(holdMessageKey(result.code))
      : result.status === "unconfirmed" ? t("unconfirmed")
      : result.status === "rate_limited" ? t("rateLimited")
      : result.status === "not_found" ? t("notHoldable")
      : t("unavailable");
    body = (
      <div className="space-y-2">
        <p role="status" className={`text-[13px] ${ok ? "font-semibold text-success-text" : "text-text-body"}`}>{msg}</p>
        {ok && <p className="text-[13px]">{myLibrary}</p>}
        {result.status === "unconfirmed" && (
          <button type="button" onClick={checkAgain} className="text-[13px] font-semibold text-brand hover:underline">{t("checkAgain")}</button>
        )}
      </div>
    );
  } else if (status.state === "signed_out") {
    body = (
      <p className="text-[13px] text-text-body">
        {t("signIn")}{" "}
        <NextLink href={`/auth/login?callbackUrl=${locale === "km" ? "/km" : ""}/catalogs/${encodeURIComponent(slug)}`} className={QUIET_LINK}>
          {t("signInButton")}
        </NextLink>
      </p>
    );
  } else if (status.state === "unlinked") {
    body = <p className="text-[13px] text-text-body">{t("unlinked")}</p>;
  } else if (status.state === "unavailable") {
    body = <p role="status" className="text-[13px] text-warning-text">{t("unavailable")}</p>;
  } else if (status.existing?.kind === "hold") {
    const h = status.existing;
    body = (
      <div className="space-y-1.5">
        <p className="text-[13px] font-semibold text-text-heading">
          {h.holdState === "waiting" ? t("youHoldWaiting") : h.holdState === "pending" && h.priority ? t("youHold", { n: h.priority }) : t("youHoldOther")}
        </p>
        <p className="text-[13px]">{myLibrary}</p>
      </div>
    );
  } else if (status.existing?.kind === "loan") {
    const l = status.existing;
    body = (
      <div className="space-y-1.5">
        <p className="text-[13px] font-semibold text-text-heading">{t("youLoan", { date: l.dueDate ? dateFmt.format(new Date(l.dueDate)) : "—" })}</p>
        <p className="text-[13px]">{myLibrary}</p>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-text-body">{t("intro")}</p>
        <button type="button" onClick={place} disabled={pending} className={BUTTON}>
          <BookmarkPlus className="h-4 w-4 shrink-0" aria-hidden />
          {pending ? t("placing") : t("button")}
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby="catalog-hold-heading" aria-busy={status === "loading" || pending} className="w-full rounded-2xl border border-divider bg-bg-surface p-5">
      {/* A label, not a heading: this column comes before the page's <h1> in reading order. */}
      <p id="catalog-hold-heading" className="mb-2 text-sm font-bold text-text-heading">{t("heading")}</p>
      {body}
    </section>
  );
}
