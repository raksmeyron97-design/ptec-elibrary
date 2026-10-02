"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";

import {
  reorderIssueArticles,
  updateJournalIssue,
  updateJournalVolume,
  type AdminIssueArticle,
} from "@/app/actions/journals";
import { StatusBadge, useToast } from "@/components/admin/kit";
import { BTN_PRIMARY, BTN_SECONDARY, ButtonBusy, Field, Switch, TEXTAREA_CLASS } from "@/components/admin/kit/form";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import { issueLabel, titleRestatesNumbering, type JournalIssue, type JournalVolume } from "@/lib/journals/types";
import CoverPicker, { uploadJournalCover, type CoverValue } from "./CoverPicker";

type IssueRow = JournalIssue & { articleCount: number; articles: AdminIssueArticle[] };

/**
 * Volumes and issues, grouped as readers meet them. Numbers are NOT editable
 * here — they come from the articles (0148 finds or creates the issue an
 * article names), and renumbering one would silently move every article in
 * it. Everything an issue page shows is editable: label, titles, date,
 * descriptions, cover, special-issue flag, visibility — and the order of its
 * table of contents.
 */
export default function IssuesEditor({ volumes, issues }: { volumes: JournalVolume[]; issues: IssueRow[] }) {
  const t = useTranslations("adminJournals");
  const canEdit = useCan("journals.edit");

  const groups = useMemo(() => {
    const byVolume = new Map<string, IssueRow[]>();
    for (const i of issues) {
      const key = i.volume_id ?? "";
      byVolume.set(key, [...(byVolume.get(key) ?? []), i]);
    }
    const sorted = volumes
      .slice()
      .sort((a, b) => b.volume_number.localeCompare(a.volume_number, "en", { numeric: true }))
      .map((v) => ({ volume: v as JournalVolume | null, issues: byVolume.get(v.id) ?? [] }));
    const loose = byVolume.get("") ?? [];
    return loose.length > 0 ? [...sorted, { volume: null, issues: loose }] : sorted;
  }, [volumes, issues]);

  return (
    <section aria-labelledby="journal-issues" className="max-w-5xl space-y-6">
      <div>
        <h2 id="journal-issues" className="text-base font-semibold text-text-heading">{t("issuesHeading")}</h2>
        <p className="mt-1 text-sm text-text-muted">{t("issuesHint")}</p>
      </div>

      {issues.length === 0 && volumes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-divider bg-bg-surface p-5 text-sm text-text-muted">{t("noIssuesYet")}</p>
      ) : (
        groups.map((g) => (
          <div key={g.volume?.id ?? "none"} className="rounded-2xl border border-divider bg-bg-surface">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-divider px-5 py-3">
              <h3 className="text-sm font-semibold text-text-heading">
                {g.volume ? `${t("issueVolume")} ${g.volume.volume_number}` : t("issuesHeading")}
              </h3>
              {g.volume && <VolumeYear volume={g.volume} canEdit={canEdit} />}
            </div>
            {g.issues.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-muted">{t("noIssuesYet")}</p>
            ) : (
              <ul className="divide-y divide-divider">
                {g.issues.map((issue) => (
                  <IssueItem key={issue.id} issue={issue} canEdit={canEdit} />
                ))}
              </ul>
            )}
          </div>
        ))
      )}
    </section>
  );
}

function VolumeYear({ volume, canEdit }: { volume: JournalVolume; canEdit: boolean }) {
  const t = useTranslations("adminJournals");
  const toast = useToast();
  const router = useRouter();
  const [year, setYear] = useState(volume.year ? String(volume.year) : "");
  const [busy, setBusy] = useState(false);
  const dirty = year !== (volume.year ? String(volume.year) : "");

  async function save() {
    setBusy(true);
    const res = await updateJournalVolume(volume.id, { year: year ? Number(year) : null, label: volume.label });
    setBusy(false);
    if (!res.ok) return toast.error(t(res.error));
    toast.success(t("saved"));
    router.refresh();
  }

  return (
    <div className="flex items-end gap-2">
      <Field label={t("volumeYearField", { volume: volume.volume_number })}>
        {(p) => (
          <input
            {...p}
            inputMode="numeric"
            className={`${p.className} h-9 w-24`}
            value={year}
            placeholder="YYYY"
            disabled={!canEdit}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        )}
      </Field>
      {canEdit && dirty && (
        <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={save}>
          {busy ? <ButtonBusy label={t("saving")} /> : t("saveIssue")}
        </button>
      )}
    </div>
  );
}

function IssueItem({ issue, canEdit }: { issue: IssueRow; canEdit: boolean }) {
  const t = useTranslations("adminJournals");
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const initial = {
    title: issue.title ?? "",
    title_km: issue.title_km ?? "",
    issue_label: issue.issue_label ?? "",
    published_date: issue.published_date ?? "",
    description: issue.description ?? "",
    description_km: issue.description_km ?? "",
    is_special_issue: issue.is_special_issue,
    is_published: issue.is_published,
  };
  const [form, setForm] = useState(initial);
  const [cover, setCover] = useState<CoverValue>({ url: issue.cover_url, file: null });
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || !!cover.file || cover.url !== issue.cover_url;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const restates =
    !!form.title.trim() && titleRestatesNumbering(form.title, issue.volume?.volume_number, issue.issue_number);
  const disabled = !canEdit || phase !== "idle";

  async function save() {
    let coverUrl = cover.url;
    if (cover.file) {
      setPhase("uploading");
      try {
        coverUrl = await uploadJournalCover(cover.file);
      } catch (err) {
        setPhase("idle");
        return toast.error(t("errorCoverUpload", { message: err instanceof Error ? err.message : String(err) }));
      }
    }
    setPhase("saving");
    const res = await updateJournalIssue(issue.id, { ...form, cover_url: coverUrl });
    setPhase("idle");
    if (!res.ok) {
      if (cover.file) setCover({ url: coverUrl, file: null });
      return toast.error(t(res.error));
    }
    setCover({ url: coverUrl, file: null });
    toast.success(t("saved"));
    router.refresh();
  }

  const label = issueLabel(issue, locale);
  // What the label field falls back to: the label built from the numbers alone.
  const numberedLabel = issueLabel({ ...issue, issue_label: null }, locale);

  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-paper/60 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-transform group-open:rotate-90" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-text-heading">{label}</span>
            <span className="ml-2 text-xs text-text-muted">
              {[issue.published_date, t("unmatchedCount", { count: issue.articleCount })].filter(Boolean).join(" · ")}
            </span>
          </span>
          {issue.is_special_issue && <StatusBadge tone="info">{t("issueSpecial")}</StatusBadge>}
          <StatusBadge tone={issue.is_published ? "success" : "neutral"}>
            {issue.is_published ? t("issuePublished") : t("draft")}
          </StatusBadge>
        </summary>

        <div className="grid gap-6 border-t border-divider bg-paper/30 px-5 py-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("issueDate")}>
                {(p) => <input {...p} type="date" value={form.published_date} disabled={disabled} onChange={(e) => set("published_date", e.target.value)} />}
              </Field>
              <Field label={t("issueLabelField")} hint={t("issueLabelHint", { label: numberedLabel })}>
                {(p) => <input {...p} value={form.issue_label} disabled={disabled} onChange={(e) => set("issue_label", e.target.value)} />}
              </Field>
            </div>
            <Field label={t("issueTitle")} hint={restates ? t("issueTitleRestates") : undefined}>
              {(p) => <input {...p} value={form.title} disabled={disabled} onChange={(e) => set("title", e.target.value)} />}
            </Field>
            <Field label={t("issueTitleKm")}>
              {(p) => <input {...p} lang="km" value={form.title_km} disabled={disabled} onChange={(e) => set("title_km", e.target.value)} />}
            </Field>
            <Field label={t("issueDescription")}>
              {(p) => <textarea {...p} rows={3} className={TEXTAREA_CLASS} value={form.description} disabled={disabled} onChange={(e) => set("description", e.target.value)} />}
            </Field>
            <Field label={t("issueDescriptionKm")}>
              {(p) => <textarea {...p} rows={3} lang="km" className={TEXTAREA_CLASS} value={form.description_km} disabled={disabled} onChange={(e) => set("description_km", e.target.value)} />}
            </Field>
            <CoverPicker label={t("issueCover")} value={cover} onChange={setCover} disabled={disabled} />
            <div className="space-y-3">
              <Switch checked={form.is_special_issue} onChange={(v) => set("is_special_issue", v)} label={t("issueSpecial")} disabled={disabled} />
              <Switch checked={form.is_published} onChange={(v) => set("is_published", v)} label={t("issuePublished")} disabled={disabled} />
            </div>
            {canEdit && (
              <div className="flex justify-end">
                <button type="button" className={BTN_PRIMARY} disabled={!dirty || phase !== "idle"} onClick={save}>
                  {phase === "uploading" ? (
                    <ButtonBusy label={t("uploadingCover")} />
                  ) : phase === "saving" ? (
                    <ButtonBusy label={t("saving")} />
                  ) : (
                    t("saveIssue")
                  )}
                </button>
              </div>
            )}
          </div>

          <IssueToc issueId={issue.id} articles={issue.articles} canEdit={canEdit} />
        </div>
      </details>
    </li>
  );
}

/**
 * The issue's table of contents as a DRAFT order with an explicit Save — the
 * Featured shelf's rule (0149): this publishes a public ordering, and a
 * mis-move is not undone by pressing the button again. Move up / Move down are
 * the mechanism; focus follows the moved row and a live region announces where
 * it landed. The server re-checks the set (set_issue_article_order refuses a
 * stale page with errorStale).
 */
function IssueToc({ issueId, articles, canEdit }: { issueId: string; articles: AdminIssueArticle[]; canEdit: boolean }) {
  const t = useTranslations("adminJournals");
  const toast = useToast();
  const router = useRouter();
  const [order, setOrder] = useState(articles);
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState("");
  const dirty = order.map((a) => a.id).join() !== articles.map((a) => a.id).join();

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = order.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setOrder(next);
    setAnnounce(t("movedAnnounce", { title: item.title, position: target + 1 }));
    requestAnimationFrame(() => {
      document.getElementById(`toc-${issueId}-${item.id}-${delta < 0 ? "up" : "down"}`)?.focus();
    });
  }

  async function save() {
    setBusy(true);
    const res = await reorderIssueArticles(issueId, order.map((a) => a.id));
    setBusy(false);
    if (!res.ok) return toast.error(t(res.error));
    toast.success(t("orderSaved"));
    router.refresh();
  }

  return (
    <div>
      <h4 className="text-sm font-semibold text-text-heading">{t("tocHeading")}</h4>
      <p className="mt-1 text-xs text-text-muted">{t("tocHint")}</p>
      <p className="sr-only" aria-live="polite">{announce}</p>
      {order.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">{t("noArticlesInIssue")}</p>
      ) : (
        <ol className="mt-3 divide-y divide-divider rounded-xl border border-divider bg-bg-surface">
          {order.map((a, i) => (
            <li key={a.id} className="flex items-start gap-3 px-3 py-2.5">
              <span className="mt-0.5 w-5 shrink-0 text-right text-xs tabular-nums text-text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug text-text-heading">{a.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                  {a.page_start && <span>{t("pagesShort", { range: a.page_end ? `${a.page_start}–${a.page_end}` : a.page_start })}</span>}
                  {!a.is_published && <StatusBadge tone="neutral">{t("draftArticle")}</StatusBadge>}
                  <Link href={`/admin/publications/edit/${a.id}`} className="focus-field rounded font-medium text-brand hover:underline">
                    {t("editArticle")}
                  </Link>
                </span>
              </span>
              {canEdit && order.length > 1 && (
                <span className="flex shrink-0 gap-1">
                  <button
                    id={`toc-${issueId}-${a.id}-up`}
                    type="button"
                    className="focus-field inline-flex h-8 w-8 items-center justify-center rounded-md border border-divider text-text-muted hover:text-brand disabled:opacity-40"
                    disabled={i === 0 || busy}
                    onClick={() => move(i, -1)}
                    aria-label={`${t("moveUp")}: ${a.title}`}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    id={`toc-${issueId}-${a.id}-down`}
                    type="button"
                    className="focus-field inline-flex h-8 w-8 items-center justify-center rounded-md border border-divider text-text-muted hover:text-brand disabled:opacity-40"
                    disabled={i === order.length - 1 || busy}
                    onClick={() => move(i, 1)}
                    aria-label={`${t("moveDown")}: ${a.title}`}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {canEdit && dirty && (
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => setOrder(articles)}>
            {t("resetOrder")}
          </button>
          <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={save}>
            {busy ? <ButtonBusy label={t("saving")} /> : t("saveOrder")}
          </button>
        </div>
      )}
    </div>
  );
}
