"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, Lock } from "lucide-react";

import { resourceCapabilities } from "@/lib/admin/access-policy";
import type { PermLevel } from "@/lib/types/roles";

/**
 * "What does this level actually let them do, here?"
 *
 * The sentence is generic because the rule is generic — read opens the pages,
 * write also changes what is on them — but the *list* underneath is not: it is
 * read straight out of `ROUTE_POLICIES` and `ACTION_POLICIES`, so an
 * administrator granting `books: read` can see the three routes it opens and
 * the two it does not, and that list cannot go stale, because adding a route to
 * the registry adds it here.
 *
 * Collapsed by default. The row's job is still "set a level"; this is the
 * evidence behind it, available in one click, not a wall in front of it.
 */
export default function ResourceAccessNote({
  resource,
  level,
  elevated,
  delegatable,
}: {
  resource: string;
  level: PermLevel;
  /** Granting this resource hands over authority beyond its own pages. */
  elevated?: boolean;
  /** The viewer is a super admin, so they may actually move an elevated row. */
  delegatable?: boolean;
}) {
  const t = useTranslations("adminRoles.semantics");
  const [open, setOpen] = useState(false);
  const caps = resourceCapabilities(resource);

  const hasDetail =
    caps.readRoutes.length > 0 || caps.writeRoutes.length > 0 || caps.writeActions.length > 0;

  return (
    <div className="mt-1.5">
      <p className="text-xs leading-snug text-text-body">{t(`grants.${level}`)}</p>

      {/* An elevated grant is the one place on this page where the level alone
          understates what is being handed over, so it says so in words — and
          says who may hand it over, since only a super admin can. */}
      {elevated && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-warning-line bg-warning-soft/40 px-2 py-1.5 text-[11px] leading-snug text-warning-text">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            {t("elevatedResource")}
            {!delegatable && <> {t("elevatedSuperAdminOnly")}</>}
          </span>
        </p>
      )}

      {hasDetail && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="focus-field mt-1 inline-flex items-center gap-1 rounded text-[11px] font-semibold text-admin-accent-text hover:underline"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
            {open ? t("hideDetail") : t("showDetail")}
          </button>

          {open && (
            <dl className="mt-2 space-y-2 rounded-lg border border-divider bg-paper/70 p-3 text-[11px]">
              {caps.readRoutes.length > 0 && (
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-text-muted">
                    {t("unlockedByRead")}
                  </dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {caps.readRoutes.map((route) => (
                      <code
                        key={route}
                        className="rounded border border-divider bg-bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-body"
                      >
                        {route}
                      </code>
                    ))}
                  </dd>
                </div>
              )}
              {caps.writeRoutes.length > 0 && (
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-text-muted">
                    {t("unlockedByWrite")}
                  </dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {caps.writeRoutes.map((route) => (
                      <code
                        key={route}
                        className="rounded border border-divider bg-bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-body"
                      >
                        {route}
                      </code>
                    ))}
                  </dd>
                </div>
              )}
              {caps.writeActions.length > 0 && (
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-text-muted">
                    {t("writeActions", { count: caps.writeActions.length })}
                  </dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {caps.writeActions.map((action) => (
                      <code
                        key={action}
                        className="rounded border border-divider bg-bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-body"
                      >
                        {action}
                      </code>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </>
      )}
    </div>
  );
}
