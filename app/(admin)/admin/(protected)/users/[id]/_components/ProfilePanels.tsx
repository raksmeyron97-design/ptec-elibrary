"use client";

/**
 * The four panels of a user profile: Overview, Access profile, Library
 * activity, Admin trail.
 *
 * Nothing here fetches. The page loaded the whole profile in one pass (see
 * `lib/admin/user-profile.ts`) precisely so that switching tabs costs no round
 * trip and no card can be stale relative to its neighbour.
 */

import { useTranslations } from "next-intl";
import {
  BookOpen, CheckCircle2, CircleSlash, Download, ExternalLink, ShieldCheck, Star,
} from "lucide-react";
import { Badge } from "@/components/admin/kit";
import { formatDate, formatRelative } from "@/lib/admin/users-shared";
import { computeDownloadProfileStatus } from "@/lib/profile/download-profile-shared";
import {
  ACCESS_PROFILE_FIELDS,
  ACTIVITY_METRIC_KEYS,
  hasValue,
  type AccessProfileField,
  type UserProfile,
} from "@/lib/admin/user-profile-shared";
import { Card, DataRow, Meter, Metric, SectionState } from "./profile-ui";

// ── Overview ─────────────────────────────────────────────────────────────────

export function OverviewPanel({ profile }: { profile: UserProfile }) {
  const t = useTranslations("adminUsers.profile");
  const tTime = useTranslations("adminUsers.time");
  const { counts, countsState, inProgress, recentActivity, activityState } = profile;

  return (
    <div className="space-y-4">
      <Card title={t("atAGlance")} description={t("atAGlanceHint")}>
        <SectionState state={countsState} emptyMessage={t("noActivity")}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {ACTIVITY_METRIC_KEYS.map((key) => (
              <Metric key={key} label={t(`metrics.${key}`)} value={counts[key]} />
            ))}
          </div>
        </SectionState>
      </Card>

      <Card title={t("continueReading")} description={t("continueReadingHint")}>
        {inProgress.length === 0 ? (
          <p className="py-2 text-[13px] text-text-muted">{t("noReadingProgress")}</p>
        ) : (
          <ul className="space-y-3">
            {inProgress.map((item) => (
              <li key={item.bookId}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-text-body">
                    {item.slug ? (
                      <a
                        href={`/books/${item.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-field rounded hover:text-brand hover:underline"
                      >
                        {item.title}
                        <ExternalLink className="ml-1 inline h-3 w-3 align-baseline" aria-hidden="true" />
                      </a>
                    ) : (
                      item.title
                    )}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-text-muted">{item.percent}%</span>
                </div>
                <div className="mt-1.5">
                  <Meter
                    percent={item.percent}
                    label={t("progressOf", { title: item.title, percent: item.percent })}
                    tone={item.percent >= 95 ? "success" : "brand"}
                  />
                </div>
                <p className="mt-1 text-[11.5px] text-text-muted">
                  {t("lastRead", { when: formatRelative(item.updatedAt, tTime) })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("recentActivity")}>
        <SectionState state={activityState} emptyMessage={t("noActivity")}>
          <ul className="space-y-2.5">
            {recentActivity.map((item, i) => (
              <li key={`${item.kind}-${item.at}-${i}`} className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${
                    item.kind === "download"
                      ? "border-info-line bg-info-soft text-info-text"
                      : "border-warning-line bg-warning-soft text-warning-text"
                  }`}
                  aria-hidden="true"
                >
                  {item.kind === "download" ? <Download className="h-3 w-3" /> : <Star className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-text-body">
                    {/* The verb and the subject are separate values — the
                        sentence is composed in the reader's locale, not on the
                        server (see ProfileActivityItem). */}
                    {item.kind === "download"
                      ? t("activity.downloaded", { title: item.subject ?? t("deletedResource") })
                      : t("activity.reviewed", {
                          title: item.subject ?? t("deletedResource"),
                          rating: item.rating ?? 0,
                        })}
                  </span>
                  <span className="text-[11.5px] text-text-muted">{formatRelative(item.at, tTime)}</span>
                </span>
                {item.href && (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("openResource", { title: item.subject ?? "" })}
                    className="focus-field shrink-0 rounded p-1 text-text-muted hover:text-brand"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </SectionState>
      </Card>
    </div>
  );
}

// ── Access profile ───────────────────────────────────────────────────────────

/**
 * The record the reader filled in to unlock thesis downloads. It is the reason
 * this page exists: a librarian approving restricted access could see the
 * request and not the credentials behind it.
 */
export function AccessPanel({ profile }: { profile: UserProfile }) {
  const t = useTranslations("adminUsers.profile");
  // The reader's OWN label catalogue — the same strings their Settings form
  // shows them. One column, one word, on both screens.
  const tDl = useTranslations("downloadProfile");
  const { accessProfile, accessProfileState } = profile;

  /* The verdict that actually gates a thesis download, from the one pure
     function the download route and the permission engine use. A local
     calculator here could report "ready" over a refusal. */
  const status = computeDownloadProfileStatus(accessProfile);
  const consented =
    !status.missingFields.includes("responsible_use_accepted_at") &&
    !status.missingFields.includes("download_privacy_consent_at");

  const value = (field: AccessProfileField): string | null => {
    if (!accessProfile) return null;
    const raw = accessProfile[field.key];
    if (!hasValue(raw)) return null;
    // A stored enum is a KEY: translated when the catalogue knows it, printed
    // as itself when a later migration adds a value this build has no word for.
    const key = field.enumNs ? `${field.enumNs}.${raw}` : null;
    const label = key && tDl.has(key) ? tDl(key) : raw;
    // "Other" is a bucket, not an answer — the reader's own words ride with it.
    if (field.key === "download_purpose" && raw === "other" && hasValue(accessProfile.download_purpose_other)) {
      return `${label} — ${accessProfile.download_purpose_other}`;
    }
    return label;
  };

  const institutional = ACCESS_PROFILE_FIELDS.filter((f) => !f.sensitive);
  const personal = ACCESS_PROFILE_FIELDS.filter((f) => f.sensitive);

  return (
    <div className="space-y-4">
      <Card
        title={t("accessProfile")}
        description={t("accessProfileHint")}
        actions={
          accessProfileState === "ready" ? (
            <Badge tone={status.complete ? "success" : "warning"}>
              {status.complete ? t("downloadReady") : t("downloadBlocked")}
            </Badge>
          ) : null
        }
      >
        <SectionState state={accessProfileState} emptyMessage={t("noAccessProfile")}>
          <div className="mb-4 rounded-xl border border-divider bg-paper px-4 py-3">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold text-text-body">{t("completeness")}</span>
              <span className="text-xs tabular-nums text-text-muted">{status.percent}%</span>
            </div>
            <Meter
              percent={status.percent}
              label={t("completeness")}
              tone={status.complete ? "success" : status.percent >= 50 ? "brand" : "warning"}
            />
            {/* Which fields are missing, named — an administrator asked why a
                reader cannot download needs the answer, not a percentage. */}
            {status.missingFields.length > 0 && (
              <p className="mt-2 text-[11.5px] leading-relaxed text-text-muted">
                {t("missingPrefix")}{" "}
                {status.missingFields
                  .map((f) =>
                    tDl.has(`fields.${f}`)
                      ? tDl(`fields.${f}`)
                      : f === "responsible_use_accepted_at"
                        ? tDl("consent.responsibleShort")
                        : f === "download_privacy_consent_at"
                          ? tDl("consent.privacyShort")
                          : f,
                  )
                  .join(", ")}
              </p>
            )}
            {status.updatedAt && (
              <p className="mt-1.5 text-[11.5px] text-text-muted">
                {t("profileUpdated", { date: formatDate(status.updatedAt) })}
              </p>
            )}
          </div>

          <dl className="divide-y divide-divider">
            {institutional.map((field) => (
              <DataRow key={field.key} label={tDl(`fields.${field.key}`)} value={value(field)} />
            ))}
          </dl>

          <h4 className="mb-1 mt-5 text-xs font-semibold text-text-body">{t("personalDetails")}</h4>
          <p className="mb-2 text-[11.5px] text-text-muted">{t("personalDetailsHint")}</p>
          <dl className="divide-y divide-divider">
            {personal.map((field) => (
              <DataRow
                key={field.key}
                label={tDl(`fields.${field.key}`)}
                value={value(field)}
                mono={field.key === "student_staff_id"}
              />
            ))}
          </dl>
        </SectionState>
      </Card>

      <Card title={t("consents")} description={t("consentsHint")}>
        <SectionState state={accessProfileState} emptyMessage={t("noAccessProfile")}>
          <ConsentRow
            label={tDl("consent.responsibleShort")}
            at={accessProfile?.responsible_use_accepted_at ?? null}
          />
          <ConsentRow
            label={tDl("consent.privacyShort")}
            at={accessProfile?.download_privacy_consent_at ?? null}
          />
          {!consented && (
            <p className="mt-3 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[12px] text-warning-text">
              {t("consentBlocksDownloads")}
            </p>
          )}
        </SectionState>
      </Card>
    </div>
  );
}

function ConsentRow({ label, at }: { label: string; at: string | null }) {
  const t = useTranslations("adminUsers.profile");
  const given = Boolean(at);
  return (
    <div className="flex items-start gap-2.5 border-b border-divider py-2.5 last:border-0">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          given ? "bg-success-soft text-success-text" : "bg-paper text-text-muted"
        }`}
        aria-hidden="true"
      >
        {given ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleSlash className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-text-body">{label}</span>
        <span className="text-[11.5px] text-text-muted">
          {given ? t("acceptedOn", { date: formatDate(at) }) : t("notAccepted")}
        </span>
      </span>
    </div>
  );
}

// ── Library activity ─────────────────────────────────────────────────────────

const REQUEST_TONE: Record<string, "neutral" | "success" | "warning" | "info"> = {
  pending: "warning",
  approved: "info",
  added: "success",
  rejected: "neutral",
};

export function ActivityPanel({ profile }: { profile: UserProfile }) {
  const t = useTranslations("adminUsers.profile");
  const tTime = useTranslations("adminUsers.time");
  const { counts, countsState, requests, pushDevices } = profile;

  return (
    <div className="space-y-4">
      <Card title={t("libraryActivity")} description={t("libraryActivityHint")}>
        <SectionState state={countsState} emptyMessage={t("noActivity")}>
          <dl className="divide-y divide-divider">
            {ACTIVITY_METRIC_KEYS.map((key) => (
              <DataRow
                key={key}
                label={t(`metrics.${key}`)}
                value={<span className="tabular-nums">{counts[key].toLocaleString()}</span>}
              />
            ))}
          </dl>
          <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-text-muted">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t("privateContentNotice")}
          </p>
        </SectionState>
      </Card>

      <Card title={t("bookRequests")} description={t("bookRequestsHint")}>
        {requests.length === 0 ? (
          <p className="py-2 text-[13px] text-text-muted">{t("noRequests")}</p>
        ) : (
          <ul className="divide-y divide-divider">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-text-body">{r.title}</span>
                  <span className="text-[11.5px] text-text-muted">{formatRelative(r.createdAt, tTime)}</span>
                </span>
                <Badge tone={REQUEST_TONE[r.status] ?? "neutral"}>
                  {t.has(`requestStatus.${r.status}`) ? t(`requestStatus.${r.status}`) : r.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("devices")} description={t("devicesHint")}>
        {pushDevices === null ? (
          <p className="text-[13px] text-text-muted">{t("sectionUnavailable")}</p>
        ) : (
          <p className="flex items-center gap-2 text-[13px] text-text-body">
            <BookOpen className="h-4 w-4 text-text-muted" aria-hidden="true" />
            {t("pushDevices", { count: pushDevices })}
          </p>
        )}
      </Card>
    </div>
  );
}

// ── Admin trail ──────────────────────────────────────────────────────────────

export function TrailPanel({ profile }: { profile: UserProfile }) {
  const t = useTranslations("adminUsers.profile");
  const tTime = useTranslations("adminUsers.time");
  const { adminTrail, adminTrailState } = profile;

  return (
    <Card title={t("adminTrail")} description={t("adminTrailHint")}>
      <SectionState state={adminTrailState} emptyMessage={t("noAdminTrail")}>
        <ol className="relative space-y-4 border-l border-divider pl-5">
          {adminTrail.map((item) => (
            <li key={item.id} className="relative">
              <span
                className="absolute -left-[1.4375rem] top-1.5 h-2 w-2 rounded-full border-2 border-bg-surface bg-brand"
                aria-hidden="true"
              />
              <p className="text-[13px] font-medium text-text-body">
                {t.has(`trailAction.${item.action}`) ? t(`trailAction.${item.action}`) : item.action}
              </p>
              <p className="text-[11.5px] text-text-muted">
                {item.actorName
                  ? t("trailBy", { actor: item.actorName, when: formatRelative(item.at, tTime) })
                  : formatRelative(item.at, tTime)}
              </p>
            </li>
          ))}
        </ol>
      </SectionState>
    </Card>
  );
}
