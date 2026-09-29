"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, FileSearch, ListTree, Loader2, Plus, Trash2 } from "lucide-react";
import { FieldEmptyState, FormSection, INPUT_CLASS } from "@/components/admin/kit/form";
import { ConfirmDialog } from "@/components/admin/kit";
import { draftThesisContents } from "@/app/actions/theses";
import type { ContentsEntry } from "@/lib/theses/contents";

/**
 * The thesis's table of contents, as printed: one row per chapter or section.
 *
 * "Draft from the PDF" reads the PDF's indexed contents page
 * (lib/theses/contents.ts) and fills the rows — it never saves anything. The
 * draft is an inference from whitespace-collapsed text, so it is presented as
 * one: a notice asks the librarian to check every line, and replacing rows
 * they have already typed needs a confirmation. Saving the thesis is what
 * stores the list.
 *
 * The draft needs a saved thesis whose PDF has been indexed, so the button is
 * shown only on an edit of a record with a PDF; otherwise one line says when
 * it becomes available (omitted, not disabled — see the admin form standard).
 */
export default function ContentsEditor({
  entries,
  onChange,
  thesisId,
  canDraft,
  disabled,
}: {
  entries: ContentsEntry[];
  onChange: (next: ContentsEntry[]) => void;
  /** Present on edit. The draft reads this thesis's indexed pages. */
  thesisId?: string;
  /** True when the saved record has a PDF the indexer can have read. */
  canDraft: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("adminThesisForm.contents");
  const [drafting, setDrafting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const [pendingDraft, setPendingDraft] = useState<ContentsEntry[] | null>(null);
  const [pendingPages, setPendingPages] = useState<number[]>([]);

  const update = (i: number, patch: Partial<ContentsEntry>) =>
    onChange(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const add = () => onChange([...entries, { level: 1, label: "" }]);

  const apply = (draft: ContentsEntry[], pages: number[]) => {
    onChange(draft);
    const first = pages[0];
    const last = pages[pages.length - 1];
    setNotice({
      tone: "info",
      text: t("drafted", { count: pages.length, pages: first === last ? String(first) : `${first}–${last}` }),
    });
  };

  async function draft() {
    if (!thesisId) return;
    setDrafting(true);
    setNotice(null);
    try {
      const res = await draftThesisContents(thesisId);
      if (!res.ok) {
        setNotice({
          tone: "warning",
          text:
            res.reason === "failed"
              ? t("reason.failed", { error: "error" in res ? res.error : "" })
              : t(`reason.${res.reason}`),
        });
        return;
      }
      // Rows the librarian already typed are theirs: replacing them is asked,
      // not assumed. An empty or blank-only list is replaced directly.
      if (entries.some((e) => e.label.trim())) {
        setPendingDraft(res.entries);
        setPendingPages(res.sourcePages);
      } else {
        apply(res.entries, res.sourcePages);
      }
    } catch (error) {
      setNotice({ tone: "warning", text: t("reason.failed", { error: error instanceof Error ? error.message : String(error) }) });
    } finally {
      setDrafting(false);
    }
  }

  const draftButton =
    canDraft && thesisId ? (
      <button
        type="button"
        onClick={draft}
        disabled={disabled || drafting}
        aria-busy={drafting}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/20 disabled:opacity-50"
      >
        {drafting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {drafting ? t("drafting") : t("draft")}
      </button>
    ) : null;

  return (
    <FormSection
      title={t("heading")}
      description={t("intro")}
      action={draftButton}
      className="border-0 bg-transparent p-0 sm:p-0"
    >
      {!draftButton && <p className="text-xs text-text-muted">{t("draftUnavailable")}</p>}

      {notice && (
        <p
          role="status"
          className={
            notice.tone === "info"
              ? "rounded-lg border border-info-line bg-info-soft px-3 py-2 text-xs leading-[1.6] text-info-text"
              : "rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-xs leading-[1.6] text-warning-text"
          }
        >
          {notice.text}
        </p>
      )}

      {entries.length === 0 ? (
        <FieldEmptyState icon={ListTree} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <div>
          {/* Column headings for sighted users; every control also carries its
              own row-numbered accessible name. */}
          <div aria-hidden="true" className="mb-1.5 hidden gap-2 text-xs font-medium text-text-muted sm:flex">
            <span className="w-32 shrink-0">{t("colLevel")}</span>
            <span className="w-20 shrink-0">{t("colNumber")}</span>
            <span className="min-w-0 flex-1">{t("colLabel")}</span>
            <span className="w-24 shrink-0">{t("colPage")}</span>
            <span className="w-[5.25rem] shrink-0" />
          </div>
          <ol className="space-y-2">
            {entries.map((entry, i) => {
              const n = i + 1;
              return (
                <li
                  key={i}
                  // A section sits under its chapter; the indent is the only
                  // cue, so it is applied to the whole row.
                  className={`flex flex-wrap items-center gap-2 sm:flex-nowrap ${entry.level === 2 ? "sm:pl-8" : ""}`}
                >
                  <select
                    aria-label={t("levelAria", { n })}
                    value={entry.level}
                    onChange={(e) => update(i, { level: e.target.value === "2" ? 2 : 1 })}
                    disabled={disabled}
                    className={`${INPUT_CLASS} w-32 shrink-0`}
                  >
                    <option value={1}>{t("levelChapter")}</option>
                    <option value={2}>{t("levelSection")}</option>
                  </select>
                  <input
                    aria-label={t("numberAria", { n })}
                    value={entry.number ?? ""}
                    onChange={(e) => update(i, { number: e.target.value || undefined })}
                    disabled={disabled}
                    className={`${INPUT_CLASS} w-20 shrink-0`}
                  />
                  <input
                    aria-label={t("labelAria", { n })}
                    value={entry.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    disabled={disabled}
                    placeholder={t("labelPlaceholder")}
                    className={`${INPUT_CLASS} min-w-[12rem] flex-1`}
                  />
                  <input
                    aria-label={t("pageAria", { n })}
                    value={entry.page ?? ""}
                    onChange={(e) => update(i, { page: e.target.value || undefined })}
                    disabled={disabled}
                    className={`${INPUT_CLASS} w-24 shrink-0`}
                  />
                  <span className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={disabled || i === 0}
                      aria-label={t("moveUp", { n })}
                      className="rounded-md p-1.5 text-text-muted hover:text-brand disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={disabled || i === entries.length - 1}
                      aria-label={t("moveDown", { n })}
                      className="rounded-md p-1.5 text-text-muted hover:text-brand disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      disabled={disabled}
                      aria-label={t("remove", { n })}
                      className="rounded-md p-1.5 text-text-muted hover:text-danger disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-1.5 text-xs text-text-muted">{t("pageHint")}</p>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-lg border border-divider px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
        >
          <Plus className="h-3 w-3" aria-hidden="true" /> {t("add")}
        </button>
      </div>

      <ConfirmDialog
        open={pendingDraft != null}
        tone="brand"
        title={t("replaceTitle")}
        description={t("replaceBody", { count: entries.length })}
        confirmLabel={t("replaceConfirm")}
        cancelLabel={t("cancel")}
        onCancel={() => setPendingDraft(null)}
        onConfirm={() => {
          if (pendingDraft) apply(pendingDraft, pendingPages);
          setPendingDraft(null);
        }}
      />
    </FormSection>
  );
}
