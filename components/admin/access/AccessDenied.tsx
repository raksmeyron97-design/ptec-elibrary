import { getTranslations } from "next-intl/server";
import { ArrowLeft, Eye, EyeOff, Lock, PencilLine, ShieldCheck } from "lucide-react";

import { resolveRoutePolicy, type AccessDenial } from "@/lib/admin/access-policy";
import { titleizeResourceKey } from "@/lib/admin/roles-shared";
import type { PermLevel } from "@/lib/types/roles";

/**
 * The 403 surface for the admin panel.
 *
 * It answers the only two questions a blocked administrator actually has —
 * *what do I have* and *what does this need* — and then gives them somewhere to
 * go. That is why it is not styled as an error: nothing is broken, the system
 * worked, and red is reserved in this panel for "something failed". Amber and
 * neutral, the same status tokens every other advisory callout uses.
 *
 * What it deliberately never shows: the error message, the digest, the route's
 * internals, the query, or anything about *why* the permission table says what
 * it says. A denial page is read by exactly the person who should learn the
 * least from it.
 */

const LEVEL_ICON: Record<PermLevel, typeof Eye> = {
  none: EyeOff,
  read: Eye,
  write: PencilLine,
};

/** Neutral for what you have, amber for what you are missing. */
function LevelChip({
  level,
  tone,
  label,
}: {
  level: PermLevel;
  tone: "current" | "required";
  label: string;
}) {
  const Icon = LEVEL_ICON[level];
  const styles =
    tone === "required"
      ? "border-warning-line bg-warning-soft text-warning-text"
      : "border-divider bg-bg-surface text-text-body";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${styles}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

export default async function AccessDenied({ denial }: { denial: AccessDenial }) {
  const [t, tLevels, tResources, tRoles, tNav] = await Promise.all([
    getTranslations("adminErrors.access"),
    getTranslations("adminRoles.levels"),
    getTranslations("adminRoles.resources"),
    getTranslations("adminUsers.roles"),
    getTranslations("adminShell.nav"),
  ]);

  const backPolicy = resolveRoutePolicy(denial.backTo);
  const backLabel = backPolicy?.navKey
    ? t("back", { area: tNav(backPolicy.navKey) })
    : t("backDashboard");

  const resourceLabel = denial.resource
    ? (() => {
        // A resource added to the matrix but not yet to the message catalogue
        // must degrade to English words, never to a raw `adminRoles.resources.x`.
        const translated = tResources(denial.resource);
        return translated.includes(".") ? titleizeResourceKey(denial.resource) : translated;
      })()
    : null;

  return (
    <div className="flex w-full justify-center px-4 py-12 sm:py-20">
      <section
        role="alert"
        aria-labelledby="access-denied-title"
        className="w-full max-w-lg rounded-2xl border border-divider bg-bg-surface p-8 shadow-sm"
      >
        <span
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-warning-line bg-warning-soft text-warning-text"
          aria-hidden="true"
        >
          <Lock className="h-6 w-6" />
        </span>

        <h1
          id="access-denied-title"
          className="text-center text-lg font-bold tracking-tight text-text-heading"
        >
          {t("title")}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-relaxed text-text-body">
          {t("body")}
        </p>

        {/* The comparison. Resource-based denials get both halves; a role-based
            one has no matrix row to report, so it states the role instead. */}
        {resourceLabel && denial.requiredLevel && (
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-divider bg-paper p-4">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {t("currentAccess")}
              </dt>
              <dd className="mt-2 flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-text-heading">{resourceLabel}</span>
                <LevelChip
                  level={denial.currentLevel ?? "none"}
                  tone="current"
                  label={tLevels(`${denial.currentLevel ?? "none"}Short`)}
                />
              </dd>
            </div>
            <div className="rounded-xl border border-warning-line bg-warning-soft/40 p-4">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-warning-text">
                {t("requiredAccess")}
              </dt>
              <dd className="mt-2 flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-text-heading">{resourceLabel}</span>
                <LevelChip
                  level={denial.requiredLevel}
                  tone="required"
                  label={tLevels(`${denial.requiredLevel}Short`)}
                />
              </dd>
            </div>
          </dl>
        )}

        {denial.requiredRoles && denial.requiredRoles.length > 0 && (
          <div className="mt-6 rounded-xl border border-warning-line bg-warning-soft/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-warning-text">
              {t("requiredRole")}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              {denial.requiredRoles.map((role) => (
                <span
                  key={role}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-warning-line bg-bg-surface px-2.5 py-1 text-xs font-semibold text-text-heading"
                >
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {tRoles(role)}
                </span>
              ))}
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-xs leading-relaxed text-text-muted">{t("contact")}</p>

        <div className="mt-6 flex justify-center">
          {/* A full document load, not client navigation: leaving a 403'd
              segment has to re-run the server guard for the destination, and a
              soft transition can restore a cached RSC payload instead. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a
              full document load on purpose: leaving a 403'd segment has to
              re-run the destination's server guard, and a client transition can
              restore a cached RSC payload instead. */}
          <a
            href={denial.backTo}
            className="focus-field inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-contrast shadow-sm transition-colors duration-150 hover:bg-brand-hover"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {backLabel}
          </a>
        </div>
      </section>
    </div>
  );
}
