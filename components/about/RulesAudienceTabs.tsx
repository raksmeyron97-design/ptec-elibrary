"use client";

// components/about/RulesAudienceTabs.tsx
//
// "Which rules apply to me?" — an accessible tab set over the four audiences.
//
// Accessibility contract (WAI-ARIA Authoring Practices, Tabs pattern):
//   • ONE tab in the tab order at a time (`tabIndex` -1 on the inactive ones);
//     Arrow keys move between tabs, Home/End jump to the ends. Without this a
//     keyboard user has to tab through every audience to reach the panel.
//   • Activation is automatic (selection follows focus), which is the
//     recommended behaviour when switching panels is instant and cheap.
//   • Each panel is `aria-labelledby` its tab and each tab
//     `aria-controls` its panel.
//   • Inactive panels use the `hidden` attribute, so they are out of the
//     accessibility tree AND out of find-in-page — but the print stylesheet
//     un-hides them, so a printed copy contains every audience.
//
// Content contract: these panels summarise. They deliberately do NOT repeat
// the full rule text, which lives exactly once in the accordion below — the
// tabs list which categories apply and what the borrowing allowance is.
//
// URL state: the active audience is mirrored into `?for=` with
// history.replaceState, so a link to "the staff rules" is shareable without
// pushing a new history entry on every arrow-key press (which would trap the
// user's Back button).

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BookCopy, CalendarClock, CheckCircle2, Info } from "lucide-react";
import { RULE_AUDIENCES, type RuleAudience } from "@/lib/about/types";
import type { BorrowingAllowance, RuleCategory } from "@/lib/about/types";
import type { AboutLocale } from "@/lib/about/format";
import { localized } from "@/lib/about/format";

const QUERY_KEY = "for";

function isAudience(value: string | null): value is RuleAudience {
  return value !== null && (RULE_AUDIENCES as readonly string[]).includes(value);
}

export default function RulesAudienceTabs({
  categories,
  allowances,
  locale,
}: {
  categories: RuleCategory[];
  allowances: BorrowingAllowance[];
  locale: AboutLocale;
}) {
  const t = useTranslations("about.rules");
  const baseId = useId();
  const [active, setActive] = useState<RuleAudience>("students");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Read the URL once on mount rather than during render: the page is
  // prerendered, and reading a search param at render time would make the
  // server and client markup disagree.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get(QUERY_KEY);
    if (isAudience(param)) setActive(param);
  }, []);

  const select = useCallback((audience: RuleAudience) => {
    setActive(audience);
    const url = new URL(window.location.href);
    url.searchParams.set(QUERY_KEY, audience);
    window.history.replaceState(null, "", url);
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const index = RULE_AUDIENCES.indexOf(active);
      let next: number | null = null;
      if (event.key === "ArrowRight") next = (index + 1) % RULE_AUDIENCES.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + RULE_AUDIENCES.length) % RULE_AUDIENCES.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = RULE_AUDIENCES.length - 1;
      if (next === null) return;
      event.preventDefault();
      const target = RULE_AUDIENCES[next];
      select(target);
      tabRefs.current[target]?.focus();
    },
    [active, select],
  );

  const allowanceFor = useMemo(
    () => new Map(allowances.map((a) => [a.audience, a])),
    [allowances],
  );

  return (
    <div>
      <div
        role="tablist"
        aria-label={t("audience.label")}
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {RULE_AUDIENCES.map((audience) => {
          const selected = audience === active;
          return (
            <button
              key={audience}
              ref={(node) => {
                tabRefs.current[audience] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${audience}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${audience}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(audience)}
              onKeyDown={onKeyDown}
              className={[
                "inline-flex min-h-11 shrink-0 items-center rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                                selected
                  ? "border-brand bg-brand text-brand-contrast shadow-sm"
                  : "border-divider bg-bg-surface text-text-body hover:border-brand/40 hover:text-brand",
              ].join(" ")}
            >
              {t(`audience.${audience}`)}
            </button>
          );
        })}
      </div>

      {RULE_AUDIENCES.map((audience) => {
        const selected = audience === active;
        const allowance = allowanceFor.get(audience);
        const applicable = categories.filter((c) => c.audiences.includes(audience));

        return (
          <div
            key={audience}
            role="tabpanel"
            id={`${baseId}-panel-${audience}`}
            aria-labelledby={`${baseId}-tab-${audience}`}
            hidden={!selected}
            // tabIndex 0 so a keyboard user can scroll the panel after
            // tabbing out of the tablist, per the APG.
            tabIndex={0}
            className="mt-5 rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm sm:p-6"
          >
            {/* Print-only heading: on paper the tabs are gone, so each
                panel needs to say who it is for. */}
            <p className="hidden text-sm font-semibold text-text-heading print:mb-3 print:block">
              {t(`audience.${audience}`)}
            </p>

            {allowance ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-divider bg-paper p-4">
                  <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                    <BookCopy className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("quick.maxItems")}
                  </dt>
                  <dd className="mt-1.5 text-xl font-semibold tabular-nums text-text-heading">
                    {t("quick.maxItemsValue", { count: allowance.maxItems })}
                  </dd>
                </div>
                {allowance.loanDays.map((loan) => {
                  const renewal = localized(loan.renewal, locale);
                  return (
                    <div key={loan.key} className="rounded-xl border border-divider bg-paper p-4">
                      <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                        {loan.key === "khmer"
                          ? t("quick.khmerBooks")
                          : loan.key === "english"
                            ? t("quick.englishBooks")
                            : t("quick.allBooks")}
                      </dt>
                      <dd className="mt-1.5 text-xl font-semibold tabular-nums text-text-heading">
                        {t("quick.days", { count: loan.days })}
                      </dd>
                      {renewal && (
                        <dd
                          lang={renewal.lang}
                          className="about-copy about-wrap mt-1 text-xs text-text-muted"
                        >
                          {renewal.text}
                        </dd>
                      )}
                    </div>
                  );
                })}
              </dl>
            ) : (
              <div className="flex gap-3 rounded-xl border border-divider bg-paper p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-text-heading">
                    {audience === "online" ? t("audience.online") : t("audience.noBorrowing")}
                  </p>
                  <p className="about-copy mt-1 text-sm text-text-muted">
                    {audience === "online"
                      ? t("audience.onlineBody")
                      : t("audience.noBorrowingBody")}
                  </p>
                </div>
              </div>
            )}

            {applicable.length > 0 ? (
              <ul className="mt-5 space-y-2.5">
                {applicable.map((category) => {
                  const summary = localized(category.summary, locale);
                  const title = localized(category.title, locale);
                  if (!summary || !title) return null;
                  return (
                    <li key={category.id} className="flex gap-2.5">
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-brand"
                        aria-hidden="true"
                      />
                      <p className="about-copy about-wrap text-sm text-text-body">
                        {/* Anchors into the full-text accordion below, so the
                            summary and the authoritative wording stay linked
                            without the wording being duplicated. */}
                        <a
                          href={`#rule-${category.id}`}
                          lang={title.lang}
                          className="rounded font-semibold text-text-heading underline decoration-divider underline-offset-4 hover:decoration-brand"
                        >
                          {title.text}
                        </a>
                        <span aria-hidden="true"> — </span>
                        <span lang={summary.lang}>{summary.text}</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-text-muted">{t("audience.empty")}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
