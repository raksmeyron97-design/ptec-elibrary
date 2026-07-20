"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import { withUpdatedParams, USERS_BASE_PATH } from "@/lib/admin/users-url";
import { ALL_ROLES } from "@/lib/types/roles";
import {
  USER_SORT_OPTIONS,
  JOINED_RANGE_OPTIONS,
  type AccountStatus,
} from "@/lib/admin/users-shared";

const STATUS_KEYS: AccountStatus[] = ["active", "pending", "disabled", "blocked"];
const wrap = "w-[158px] shrink-0 [&_button]:h-10";

export type UserFiltersValue = {
  role: string;
  status: string;
  joined: string;
  sort: string;
};

export default function UserFilters({
  value,
  hasActiveFilters,
}: {
  value: UserFiltersValue;
  hasActiveFilters: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminUsers");

  const setParam = (key: string, v: string) =>
    router.push(withUpdatedParams(searchParams, { [key]: v === "all" || v === "" ? null : v }));

  const roleLabel = (r: string) => t(`roles.${r}`);
  const statusLabel = (s: string) => t(`status.${s}`);
  const joinedLabel = (j: string) => t(`joined.${j}`);

  const chips: { key: string; label: string }[] = [];
  if (value.role && value.role !== "all")
    chips.push({ key: "role", label: t("filters.roleChip", { label: roleLabel(value.role) }) });
  if (value.status && value.status !== "all")
    chips.push({ key: "status", label: t("filters.statusChip", { label: statusLabel(value.status) }) });
  if (value.joined && value.joined !== "all")
    chips.push({ key: "joined", label: t("filters.joinedChip", { label: joinedLabel(value.joined) }) });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className={wrap}>
          <SearchableSelect
            name="role-filter"
            ariaLabel={t("filters.byRole")}
            value={value.role || "all"}
            onChange={(v) => setParam("role", v)}
            options={[{ value: "all", label: t("filters.allRoles") }, ...ALL_ROLES.map((r) => ({ value: r, label: roleLabel(r) }))]}
          />
        </div>

        <div className={wrap}>
          <SearchableSelect
            name="status-filter"
            ariaLabel={t("filters.byStatus")}
            value={value.status || "all"}
            onChange={(v) => setParam("status", v)}
            options={[{ value: "all", label: t("filters.allStatuses") }, ...STATUS_KEYS.map((s) => ({ value: s, label: statusLabel(s) }))]}
          />
        </div>

        <div className={wrap}>
          <SearchableSelect
            name="joined-filter"
            ariaLabel={t("filters.byJoined")}
            value={value.joined || "all"}
            onChange={(v) => setParam("joined", v)}
            options={JOINED_RANGE_OPTIONS.map((j) => ({ value: j, label: joinedLabel(j) }))}
          />
        </div>

        <div className={wrap}>
          <SearchableSelect
            name="sort-filter"
            ariaLabel={t("filters.sortUsers")}
            value={value.sort || "newest"}
            onChange={(v) => setParam("sort", v)}
            options={USER_SORT_OPTIONS.map((s) => ({ value: s, label: t(`sort.${s}`) }))}
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => router.push(USERS_BASE_PATH)}
            className="rounded-lg px-2 py-1 text-[13px] font-semibold text-text-muted transition hover:text-brand"
          >
            {t("filters.reset")}
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label={t("filters.active")}>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setParam(chip.key, "")}
              className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 text-[12px] font-semibold text-brand transition hover:bg-brand/10"
            >
              {chip.label}
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">{t("filters.remove")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
