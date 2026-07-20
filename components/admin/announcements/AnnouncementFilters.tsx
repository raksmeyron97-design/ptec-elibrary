"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { withUpdatedParams } from "@/lib/admin/announcements-url";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import { STATUSES, PRIORITIES, SORT_OPTIONS, type AnnouncementFiltersValue } from "@/lib/admin/announcements/shared";

const selectClass =
  "h-10 rounded-xl border border-divider bg-bg-surface px-3 text-[13.5px] text-text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-focus-ring/30";
const compactSelectWrapper = "w-[160px] shrink-0 [&_button]:h-10";

export default function AnnouncementFilters({
  value,
  creators,
  hasActiveFilters,
  resultCount,
}: {
  value: AnnouncementFiltersValue;
  creators: { id: string; name: string }[];
  hasActiveFilters: boolean;
  resultCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminAnnouncements.filters");
  const tStatus = useTranslations("adminAnnouncements.status");
  const tSort = useTranslations("adminAnnouncements.sort");
  const [moreOpen, setMoreOpen] = useState(false);
  const [q, setQ] = useState(value.q);

  // Re-sync the local echo when the URL-derived filter value changes
  // externally (back/forward nav, "clear filters") — not a derived-render case.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setQ(value.q), [value.q]);

  const setParam = (key: string, v: string) => {
    router.push(withUpdatedParams(searchParams, { [key]: v === "all" || v === "" ? null : v }));
  };

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(withUpdatedParams(searchParams, { q: q.trim() || null }));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={submitSearch} className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <label htmlFor="announcement-search" className="sr-only">{t("search")}</label>
          <input
            id="announcement-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className={`${selectClass} w-full pl-9`}
          />
        </form>

        <div className={compactSelectWrapper}>
          <SearchableSelect
            name="status-filter"
            ariaLabel={t("byStatus")}
            value={value.status || "all"}
            onChange={(v) => setParam("status", v)}
            options={[{ value: "all", label: t("allStatuses") }, ...STATUSES.map((s) => ({ value: s, label: tStatus(s) }))]}
          />
        </div>

        <div className={compactSelectWrapper}>
          <SearchableSelect
            name="channel-filter"
            ariaLabel={t("byChannel")}
            value={value.channel || "all"}
            onChange={(v) => setParam("channel", v)}
            options={[
              { value: "all", label: t("allChannels") },
              { value: "in_app", label: t("channelInApp") },
              { value: "banner", label: t("channelBanner") },
              { value: "push", label: t("channelPush") },
            ]}
          />
        </div>

        <div className={compactSelectWrapper}>
          <SearchableSelect
            name="priority-filter"
            ariaLabel={t("byPriority")}
            value={value.priority || "all"}
            onChange={(v) => setParam("priority", v)}
            options={[{ value: "all", label: t("allPriorities") }, ...PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))]}
          />
        </div>

        <div className={compactSelectWrapper}>
          <SearchableSelect
            name="sort-filter"
            ariaLabel={t("sortBy")}
            value={value.sort || "newest"}
            onChange={(v) => setParam("sort", v)}
            options={SORT_OPTIONS.map((s) => ({ value: s, label: tSort(s) }))}
          />
        </div>

        <MoreFiltersButton open={moreOpen} onOpenChange={setMoreOpen} value={value} creators={creators} />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => router.push("/admin/announcements")}
            className="rounded-lg px-2 py-1 text-[13px] font-semibold text-text-muted transition hover:text-brand"
          >
            {t("clearFilters")}
          </button>
        )}
      </div>

      <p className="text-[12.5px] text-text-muted" aria-live="polite">
        {t("resultCount", { count: resultCount })}
      </p>
    </div>
  );
}

function MoreFiltersButton({
  open,
  onOpenChange,
  value,
  creators,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: AnnouncementFiltersValue;
  creators: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminAnnouncements.filters");
  const headingId = "announcement-filters-heading";
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLButtonElement>(null);

  const [audience, setAudience] = useState(value.audience);
  const [creatorId, setCreatorId] = useState(value.creatorId);
  const [langComplete, setLangComplete] = useState(value.langComplete);
  const [dateFrom, setDateFrom] = useState(value.dateFrom);
  const [dateTo, setDateTo] = useState(value.dateTo);

  useEffect(() => {
    if (!open) return;
    // Reset the dialog's draft fields from the current URL filters every time
    // it opens — an intentional one-time sync on the `open` transition.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAudience(value.audience);
    setCreatorId(value.creatorId);
    setLangComplete(value.langComplete);
    setDateFrom(value.dateFrom);
    setDateTo(value.dateTo);
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    const trigger = triggerRef.current;
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      trigger?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeExtra = [value.audience !== "all" ? value.audience : "", value.creatorId, value.langComplete !== "all" ? value.langComplete : "", value.dateFrom].some(Boolean);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onOpenChange(false);
    router.push(withUpdatedParams(searchParams, {
      audience: audience === "all" ? null : audience,
      creatorId: creatorId || null,
      langComplete: langComplete === "all" ? null : langComplete,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    }));
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-[13.5px] font-semibold transition ${
          activeExtra ? "border-brand bg-brand/5 text-brand" : "border-divider bg-bg-surface text-text-body hover:bg-paper"
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {t("moreFilters")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => onOpenChange(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-bg-surface p-6 shadow-2xl sm:rounded-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id={headingId} className="text-lg font-bold text-text-heading">{t("moreFilters")}</h2>
              <button type="button" onClick={() => onOpenChange(false)} aria-label={t("close")} className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-paper hover:text-text-heading">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("byAudience")}</span>
                <SearchableSelect
                  ref={firstFieldRef}
                  name="audience-filter"
                  ariaLabel={t("byAudience")}
                  value={audience || "all"}
                  onChange={setAudience}
                  options={[
                    { value: "all", label: t("allAudiences") },
                    { value: "all_active", label: t("audience.all_active") },
                    { value: "role", label: t("audience.role") },
                    { value: "push_enabled", label: t("audience.push_enabled") },
                    { value: "individual", label: t("audience.individual") },
                  ]}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("byCreator")}</span>
                <SearchableSelect
                  name="creator-filter"
                  ariaLabel={t("byCreator")}
                  value={creatorId}
                  onChange={setCreatorId}
                  options={[{ value: "", label: t("anyCreator") }, ...creators.map((c) => ({ value: c.id, label: c.name }))]}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("byLanguage")}</span>
                <SearchableSelect
                  name="lang-filter"
                  ariaLabel={t("byLanguage")}
                  value={langComplete || "all"}
                  onChange={setLangComplete}
                  options={[
                    { value: "all", label: t("anyLanguage") },
                    { value: "both", label: t("bilingualComplete") },
                    { value: "en_only", label: t("englishOnly") },
                  ]}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("from")}</span>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${selectClass} w-full`} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("to")}</span>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${selectClass} w-full`} />
                </label>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setAudience("all"); setCreatorId(""); setLangComplete("all"); setDateFrom(""); setDateTo(""); }}
                className="text-[13px] font-semibold text-text-muted hover:text-brand"
              >
                {t("clearThese")}
              </button>
              <button type="submit" className="ml-auto inline-flex items-center justify-center rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover">
                {t("apply")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
