"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bell, MonitorSmartphone, MessageSquare, Pin } from "lucide-react";
import { StatusBadge } from "@/components/admin/kit";
import AnnouncementActionsMenu, { type AnnouncementRowHandlers } from "./AnnouncementActionsMenu";
import { STATUS_TONES, PRIORITY_TONES, type AnnouncementListRow } from "@/lib/admin/announcements/shared";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AnnouncementsTable({
  rows,
  rowNumberOffset,
  selectedIds,
  allSelected,
  busyId,
  onToggleSelect,
  onToggleSelectAll,
  ...handlers
}: AnnouncementRowHandlers & {
  rows: AnnouncementListRow[];
  rowNumberOffset: number;
  selectedIds: Set<string>;
  allSelected: boolean;
  busyId: string | null;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}) {
  const t = useTranslations("adminAnnouncements.table");
  const tStatus = useTranslations("adminAnnouncements.status");
  const tType = useTranslations("adminAnnouncements.type");
  const tAudience = useTranslations("adminAnnouncements.filters.audience");

  return (
    <div className="hidden rounded-xl border border-divider bg-bg-surface shadow-sm md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="border-b border-divider bg-paper text-left text-xs font-bold uppercase tracking-wide text-text-muted [&>th:first-child]:rounded-tl-xl [&>th:last-child]:rounded-tr-xl">
              <th scope="col" className="w-10 px-4 py-3">
                <label className="sr-only" htmlFor="select-all-announcements">{t("selectAll")}</label>
                <input id="select-all-announcements" type="checkbox" checked={allSelected} onChange={onToggleSelectAll} className="h-4 w-4 rounded border-divider text-brand focus:ring-focus-ring/30" />
              </th>
              <th scope="col" className="px-4 py-3">#</th>
              <th scope="col" className="px-4 py-3">{t("announcement")}</th>
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">{t("audience")}</th>
              <th scope="col" className="hidden px-4 py-3 md:table-cell">{t("channels")}</th>
              <th scope="col" className="px-4 py-3 text-center">{t("status")}</th>
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">{t("scheduleCol")}</th>
              <th scope="col" className="hidden px-4 py-3 xl:table-cell">{t("delivery")}</th>
              <th scope="col" className="hidden px-4 py-3 xl:table-cell">{t("creator")}</th>
              <th scope="col" className="px-4 py-3 text-right">{t("actionsCol")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {rows.map((row, idx) => {
              const isSelected = selectedIds.has(row.id);
              const isBusy = busyId === row.id;
              return (
                <tr key={row.id} className={`transition-colors hover:bg-paper/80 ${isBusy ? "opacity-50" : ""} ${isSelected ? "bg-brand/5" : ""}`}>
                  <td className="px-4 py-3">
                    <label className="sr-only" htmlFor={`select-ann-${row.id}`}>{t("selectOne", { name: row.internalName })}</label>
                    <input id={`select-ann-${row.id}`} type="checkbox" checked={isSelected} onChange={() => onToggleSelect(row.id)} className="h-4 w-4 rounded border-divider text-brand focus:ring-focus-ring/30" />
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-text-muted">{rowNumberOffset + idx + 1}</td>
                  <td className="max-w-[320px] px-4 py-3">
                    <div className="flex items-start gap-1.5">
                      {row.pinned && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-label={t("pinned")} />}
                      <div className="min-w-0">
                        <Link href={`/admin/announcements/${row.id}`} title={row.internalName} className="font-semibold leading-relaxed text-text-heading hover:text-brand line-clamp-2">
                          {row.titleEn}
                        </Link>
                        <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">{row.internalName}</p>
                        <p className="mt-0.5 text-xs">
                          <StatusBadge tone={PRIORITY_TONES[row.priority]}>{t(`priorityShort.${row.priority}`)}</StatusBadge>
                          <span className="ml-1.5 text-text-muted">{tType(row.type)}</span>
                          {!row.titleKm && <span className="ml-1.5 text-warning">{t("enOnly")}</span>}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-text-body lg:table-cell">
                    {row.audienceType === "role" && row.audienceRoles.length > 0
                      ? row.audienceRoles.join(", ")
                      : tAudience(row.audienceType)}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <div className="flex items-center gap-2 text-text-muted">
                      {row.channelInApp && <Bell className="h-3.5 w-3.5" aria-label={t("channelInApp")} />}
                      {row.channelBanner && <MessageSquare className="h-3.5 w-3.5" aria-label={t("channelBanner")} />}
                      {row.channelPush && <MonitorSmartphone className="h-3.5 w-3.5" aria-label={t("channelPush")} />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge tone={STATUS_TONES[row.status]}>{tStatus(row.status)}</StatusBadge>
                  </td>
                  <td className="hidden px-4 py-3 text-xs tabular-nums text-text-muted lg:table-cell">
                    {formatDate(row.scheduledAt ?? row.publishedAt)}
                  </td>
                  <td className="hidden px-4 py-3 text-xs tabular-nums text-text-muted xl:table-cell">
                    {row.delivery ? (
                      <span>
                        <span className="font-semibold text-success">{row.delivery.sent}</span>
                        {row.delivery.failed > 0 && <span className="text-danger"> / {row.delivery.failed} {t("failedShort")}</span>}
                        <span className="text-text-muted"> / {row.delivery.total}</span>
                      </span>
                    ) : row.channelPush ? (
                      t("pending")
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="hidden max-w-[140px] truncate px-4 py-3 text-text-body xl:table-cell">{row.createdByName ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <AnnouncementActionsMenu row={row} busy={isBusy} {...handlers} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
