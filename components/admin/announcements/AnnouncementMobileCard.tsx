"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Bell, MonitorSmartphone, MessageSquare, Pin } from "lucide-react";
import { StatusBadge } from "@/components/admin/kit";
import AnnouncementActionsMenu, { type AnnouncementRowHandlers } from "./AnnouncementActionsMenu";
import { STATUS_TONES, PRIORITY_TONES, type AnnouncementListRow } from "@/lib/admin/announcements/shared";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AnnouncementMobileCard({
  rows,
  selectedIds,
  busyId,
  onToggleSelect,
  ...handlers
}: AnnouncementRowHandlers & {
  rows: AnnouncementListRow[];
  selectedIds: Set<string>;
  busyId: string | null;
  onToggleSelect: (id: string) => void;
}) {
  const t = useTranslations("adminAnnouncements.table");
  const tStatus = useTranslations("adminAnnouncements.status");

  return (
    <div className="space-y-3 md:hidden">
      {rows.map((row) => {
        const isSelected = selectedIds.has(row.id);
        const isBusy = busyId === row.id;
        return (
          <div key={row.id} className={`rounded-xl border p-4 shadow-sm transition ${isSelected ? "border-brand/40 bg-brand/5" : "border-divider bg-bg-surface"} ${isBusy ? "opacity-50" : ""}`}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(row.id)}
                aria-label={t("selectOne", { name: row.internalName })}
                className="mt-1 h-4 w-4 shrink-0 rounded border-divider text-brand focus:ring-focus-ring/30"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1.5">
                  {row.pinned && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />}
                  <Link href={`/admin/announcements/${row.id}`} title={row.internalName} className="font-semibold leading-relaxed text-text-heading hover:text-brand line-clamp-2">
                    {row.titleEn}
                  </Link>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">{row.internalName}</p>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={STATUS_TONES[row.status]}>{tStatus(row.status)}</StatusBadge>
                  <StatusBadge tone={PRIORITY_TONES[row.priority]}>{t(`priorityShort.${row.priority}`)}</StatusBadge>
                  {!row.titleKm && <StatusBadge tone="warning">{t("enOnly")}</StatusBadge>}
                </div>

                <div className="mt-2.5 flex items-center gap-2.5 text-text-muted">
                  {row.channelInApp && <Bell className="h-3.5 w-3.5" aria-label={t("channelInApp")} />}
                  {row.channelBanner && <MessageSquare className="h-3.5 w-3.5" aria-label={t("channelBanner")} />}
                  {row.channelPush && <MonitorSmartphone className="h-3.5 w-3.5" aria-label={t("channelPush")} />}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs text-text-muted">
                  <dt className="font-semibold text-text-body">{t("scheduleCol")}</dt>
                  <dd className="text-right">{formatDate(row.scheduledAt ?? row.publishedAt)}</dd>
                  {row.delivery && (
                    <>
                      <dt className="font-semibold text-text-body">{t("delivery")}</dt>
                      <dd className="text-right">
                        <span className="font-semibold text-success">{row.delivery.sent}</span>
                        {row.delivery.failed > 0 && <span className="text-danger"> / {row.delivery.failed}</span>}
                        <span> / {row.delivery.total}</span>
                      </dd>
                    </>
                  )}
                  <dt className="font-semibold text-text-body">{t("creator")}</dt>
                  <dd className="text-right truncate">{row.createdByName ?? "—"}</dd>
                </dl>
              </div>
              <AnnouncementActionsMenu row={row} busy={isBusy} {...handlers} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
