"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, ExternalLink, Search } from "lucide-react";
import { Badge, ConfirmDialog, useToast } from "@/components/admin/kit";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import {
  ignoreRetiredUrl,
  markRetiredUrlGone,
  redirectRetiredUrl,
  searchRedirectTargets,
  type RedirectTargetOption,
  type RetiredUrlResult,
} from "@/app/actions/retired-urls";
import { GONE_REASONS, targetFromInput, type GoneReason, type Suggestion } from "@/lib/url-redirects/queue";

export type UIPendingRow = {
  path: string;
  recordType: "book" | "thesis" | "subject";
  title: string | null;
  cause: "deleted" | "unpublished" | "seeded";
  note: string | null;
  suggestedPath: string | null;
  retiredLabel: string | null;
  resolvedElsewhere: boolean;
  suggestions: Suggestion[];
};

/** A path as a link that opens the live site in a new tab, so a librarian can
 *  look at a successor before choosing it. Paths are decoded; the href is not. */
function PathLink({ path, label }: { path: string; label?: string }) {
  const href = path
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="focus-field inline-flex max-w-full items-center gap-1 break-all rounded font-mono text-xs text-brand hover:underline"
    >
      {label ?? path}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

export default function PendingRow({ row, canResolve }: { row: UIPendingRow; canResolve: boolean }) {
  const t = useTranslations("adminRetiredUrls");
  const toast = useToast();
  const router = useRouter();
  const allowed = useCan("books.retiredUrls.resolve") && canResolve;
  const [pending, startTransition] = useTransition();
  const [goneOpen, setGoneOpen] = useState(false);
  const [goneReason, setGoneReason] = useState<GoneReason>("withdrawn");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<RedirectTargetOption[]>([]);
  const searchId = useId();
  const reasonName = useId();

  const pasted = targetFromInput(query);
  const searching = searchOpen && !pasted && query.trim().length >= 2;
  // Derived, not cleared in the effect: a stale result list is hidden the
  // moment the query stops being a search.
  const visibleOptions = searching ? options : [];

  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchRedirectTargets(query);
      if (!cancelled) setOptions(found.filter((o) => o.path !== row.path));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searching, row.path]);

  function settle(result: RetiredUrlResult, success: string) {
    if (result.success) {
      toast.success(success);
      router.refresh();
    } else {
      toast.error(t(`errors.${result.code}`));
    }
  }

  function redirectTo(target: string) {
    startTransition(async () => {
      settle(await redirectRetiredUrl({ path: row.path, target }), t("toast.redirected", { target }));
    });
  }

  function confirmGone() {
    startTransition(async () => {
      const result = await markRetiredUrlGone({ path: row.path, reason: goneReason });
      setGoneOpen(false);
      settle(result, t("toast.gone"));
    });
  }

  function ignore() {
    startTransition(async () => {
      settle(await ignoreRetiredUrl({ path: row.path }), t("toast.ignored"));
    });
  }

  const quietButton =
    "focus-field inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-sm font-semibold text-text-body transition hover:bg-paper disabled:opacity-50";
  const primaryButton =
    "focus-field inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover disabled:opacity-50";

  return (
    <li className="space-y-3 rounded-xl border border-divider bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="break-all text-sm font-semibold text-text-heading">{row.path}</p>
          {row.title && <p className="text-sm text-text-body">{row.title}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge>{t(`recordType.${row.recordType}`)}</Badge>
            <Badge tone={row.cause === "seeded" ? "info" : "neutral"}>{t(`cause.${row.cause}`)}</Badge>
            {row.resolvedElsewhere && <Badge tone="success">{t("resolvedElsewhere")}</Badge>}
            {row.retiredLabel && <span className="text-xs text-text-muted">{t("retiredOn", { date: row.retiredLabel })}</span>}
          </div>
          {row.note && <p className="text-xs text-text-muted">{row.note}</p>}
        </div>
      </div>

      {row.suggestedPath && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info-line bg-info-soft px-3 py-2">
          <p className="min-w-0 text-sm text-info-text">
            {t("suggestedLabel")} <PathLink path={row.suggestedPath} />
          </p>
          {allowed && (
            <button type="button" className={primaryButton} disabled={pending} onClick={() => redirectTo(row.suggestedPath!)}>
              {t("actions.confirmSuggested")}
            </button>
          )}
        </div>
      )}

      {row.suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-text-muted">{t("similarLabel")}</p>
          <ul className="space-y-1.5">
            {row.suggestions.map((s) => (
              <li key={s.path} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-divider px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-text-body">{s.title}</p>
                  <PathLink path={s.path} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-text-muted">
                    {t(`basis.${s.basis}`, { score: Math.round(s.score) })}
                  </span>
                  {allowed && s.path !== row.suggestedPath && (
                    <button type="button" className={quietButton} disabled={pending} onClick={() => redirectTo(s.path)}>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("actions.redirectHere")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {allowed && (
        <div className="space-y-3 border-t border-divider pt-3">
          {searchOpen && (
            <div className="space-y-2">
              <label htmlFor={searchId} className="block text-sm font-semibold text-text-body">
                {t("search.label")}
              </label>
              <div className="focus-shell flex items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3">
                <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                <input
                  id={searchId}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("search.placeholder")}
                  className="w-full bg-transparent py-2 text-base text-text-body outline-none sm:text-sm"
                  autoComplete="off"
                />
              </div>
              <p className="text-xs text-text-muted">{t("search.hint")}</p>
              {pasted && pasted !== row.path && (
                <button type="button" className={quietButton} disabled={pending} onClick={() => redirectTo(pasted)}>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("search.usePath", { path: pasted })}
                </button>
              )}
              {visibleOptions.length > 0 && (
                <ul className="divide-y divide-divider rounded-lg border border-divider" aria-label={t("search.results")}>
                  {visibleOptions.map((o) => (
                    <li key={o.path} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-text-body">
                          {o.title} <span className="text-xs text-text-muted">· {t(`recordType.${o.kind}`)}</span>
                        </p>
                        <PathLink path={o.path} />
                      </div>
                      <button type="button" className={quietButton} disabled={pending} onClick={() => redirectTo(o.path)}>
                        {t("actions.redirectHere")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={quietButton}
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
            >
              {t("actions.redirectTo")}
            </button>
            <button type="button" className={quietButton} disabled={pending} onClick={ignore}>
              {t("actions.ignore")}
            </button>
            <button
              type="button"
              className="focus-field ml-auto inline-flex items-center gap-1.5 rounded-lg border border-danger-line px-3 py-1.5 text-sm font-semibold text-danger-text transition hover:bg-danger-soft disabled:opacity-50"
              disabled={pending}
              onClick={() => setGoneOpen(true)}
            >
              {t("actions.gone")}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={goneOpen}
        title={t("goneDialog.title")}
        tone="danger"
        confirmLabel={t("goneDialog.confirm")}
        busyLabel={t("goneDialog.busy")}
        busy={pending}
        onCancel={() => setGoneOpen(false)}
        onConfirm={confirmGone}
        description={
          <div className="space-y-3">
            <p>{t("goneDialog.body", { path: row.path })}</p>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-semibold text-text-body">{t("goneDialog.reasonLegend")}</legend>
              {GONE_REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-sm text-text-body">
                  <input
                    type="radio"
                    name={reasonName}
                    value={reason}
                    checked={goneReason === reason}
                    onChange={() => setGoneReason(reason)}
                    className="focus-field"
                  />
                  {t(`goneReason.${reason}`)}
                </label>
              ))}
            </fieldset>
            <p className="text-xs text-text-muted">{t("goneDialog.private")}</p>
          </div>
        }
      />
    </li>
  );
}
