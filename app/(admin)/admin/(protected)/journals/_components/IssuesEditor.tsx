"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { updateJournalIssue, updateJournalVolume } from "@/app/actions/journals";
import { StatusBadge, useToast } from "@/components/admin/kit";
import { BTN_SECONDARY, ButtonBusy, Field, TEXTAREA_CLASS } from "@/components/admin/kit/form";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import { issueLabel, type JournalIssue, type JournalVolume } from "@/lib/journals/types";

type IssueRow = JournalIssue & { articleCount: number };

/**
 * Details for the volumes and issues articles created. Numbers are NOT
 * editable here — they come from the articles (0148 finds or creates the
 * issue an article names), and renumbering one here would silently move every
 * article in it. Everything else an issue page shows is editable: date, title,
 * description, special-issue flag, visibility.
 */
export default function IssuesEditor({ volumes, issues }: { volumes: JournalVolume[]; issues: IssueRow[] }) {
  const t = useTranslations("adminJournals");
  const canEdit = useCan("journals.edit");

  return (
    <section aria-labelledby="journal-issues" className="max-w-5xl rounded-2xl border border-divider bg-bg-surface p-5">
      <h2 id="journal-issues" className="text-base font-semibold text-text-heading">{t("issuesHeading")}</h2>
      <p className="mt-1 text-sm text-text-muted">{t("issuesHint")}</p>

      {volumes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {volumes
            .slice()
            .sort((a, b) => a.volume_number.localeCompare(b.volume_number, "en", { numeric: true }))
            .map((v) => (
              <VolumeYear key={v.id} volume={v} canEdit={canEdit} />
            ))}
        </div>
      )}

      {issues.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">{t("noIssuesYet")}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {issues.map((issue) => (
            <IssueItem key={issue.id} issue={issue} canEdit={canEdit} />
          ))}
        </ul>
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
    <div className="flex items-end gap-2 rounded-lg border border-divider px-3 py-2">
      <Field label={`${t("issueVolume")} ${volume.volume_number}`}>
        {(p) => (
          <input
            {...p}
            inputMode="numeric"
            className={`${p.className} w-24`}
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
  const toast = useToast();
  const router = useRouter();
  const initial = {
    title: issue.title ?? "",
    issue_label: issue.issue_label ?? "",
    published_date: issue.published_date ?? "",
    description: issue.description ?? "",
    is_special_issue: issue.is_special_issue,
    is_published: issue.is_published,
  };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  async function save() {
    setBusy(true);
    const res = await updateJournalIssue(issue.id, { ...form, title_km: issue.title_km, description_km: issue.description_km });
    setBusy(false);
    if (!res.ok) return toast.error(t(res.error));
    toast.success(t("saved"));
    router.refresh();
  }

  return (
    <li className="rounded-xl border border-divider p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-text-heading">
          {issueLabel({ ...issue, issue_label: null }, "en")}
          <span className="ml-2 text-xs font-normal text-text-muted">
            {t("issueArticles")}: {issue.articleCount}
          </span>
        </p>
        <StatusBadge tone={form.is_published && issue.articleCount > 0 ? "success" : "neutral"}>
          {form.is_published ? t("issuePublished") : t("draft")}
        </StatusBadge>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <Field label={t("issueDate")}>
          {(p) => (
            <input
              {...p}
              type="date"
              value={form.published_date}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, published_date: e.target.value }))}
            />
          )}
        </Field>
        <Field label={t("issueTitle")}>
          {(p) => (
            <input
              {...p}
              value={form.title}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          )}
        </Field>
        <div className="flex flex-col justify-end gap-2 text-sm text-text-body">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              className="focus-field h-4 w-4 rounded"
              checked={form.is_special_issue}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, is_special_issue: e.target.checked }))}
            />
            {t("issueSpecial")}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              className="focus-field h-4 w-4 rounded"
              checked={form.is_published}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
            />
            {t("issuePublished")}
          </label>
        </div>
      </div>
      <div className="mt-3">
        <Field label={t("issueDescription")}>
          {(p) => (
            <textarea
              {...p}
              rows={2}
              className={TEXTAREA_CLASS}
              value={form.description}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          )}
        </Field>
      </div>
      {canEdit && dirty && (
        <div className="mt-3 flex justify-end">
          <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={save}>
            {busy ? <ButtonBusy label={t("saving")} /> : t("saveIssue")}
          </button>
        </div>
      )}
    </li>
  );
}
