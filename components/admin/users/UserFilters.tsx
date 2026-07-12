"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import { withUpdatedParams, USERS_BASE_PATH } from "@/lib/admin/users-url";
import { ALL_ROLES, ROLE_META } from "@/lib/types/roles";
import {
  STATUS_META,
  USER_SORT_OPTIONS,
  USER_SORT_LABELS,
  JOINED_RANGE_OPTIONS,
  JOINED_RANGE_LABELS,
  type AccountStatus,
  type JoinedRange,
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

  const setParam = (key: string, v: string) =>
    router.push(withUpdatedParams(searchParams, { [key]: v === "all" || v === "" ? null : v }));

  const chips: { key: string; label: string }[] = [];
  if (value.role && value.role !== "all")
    chips.push({ key: "role", label: `Role: ${ROLE_META[value.role as keyof typeof ROLE_META]?.label ?? value.role}` });
  if (value.status && value.status !== "all")
    chips.push({ key: "status", label: `Status: ${STATUS_META[value.status as AccountStatus]?.label ?? value.status}` });
  if (value.joined && value.joined !== "all")
    chips.push({ key: "joined", label: `Joined: ${JOINED_RANGE_LABELS[value.joined as JoinedRange] ?? value.joined}` });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className={wrap}>
          <SearchableSelect
            name="role-filter"
            ariaLabel="Filter by role"
            value={value.role || "all"}
            onChange={(v) => setParam("role", v)}
            options={[{ value: "all", label: "All roles" }, ...ALL_ROLES.map((r) => ({ value: r, label: ROLE_META[r].label }))]}
          />
        </div>

        <div className={wrap}>
          <SearchableSelect
            name="status-filter"
            ariaLabel="Filter by status"
            value={value.status || "all"}
            onChange={(v) => setParam("status", v)}
            options={[{ value: "all", label: "All statuses" }, ...STATUS_KEYS.map((s) => ({ value: s, label: STATUS_META[s].label }))]}
          />
        </div>

        <div className={wrap}>
          <SearchableSelect
            name="joined-filter"
            ariaLabel="Filter by join date"
            value={value.joined || "all"}
            onChange={(v) => setParam("joined", v)}
            options={JOINED_RANGE_OPTIONS.map((j) => ({ value: j, label: JOINED_RANGE_LABELS[j] }))}
          />
        </div>

        <div className={wrap}>
          <SearchableSelect
            name="sort-filter"
            ariaLabel="Sort users"
            value={value.sort || "newest"}
            onChange={(v) => setParam("sort", v)}
            options={USER_SORT_OPTIONS.map((s) => ({ value: s, label: USER_SORT_LABELS[s] }))}
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => router.push(USERS_BASE_PATH)}
            className="rounded-lg px-2 py-1 text-[13px] font-semibold text-text-muted transition hover:text-brand"
          >
            Reset filters
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setParam(chip.key, "")}
              className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 text-[12px] font-semibold text-brand transition hover:bg-brand/10"
            >
              {chip.label}
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
