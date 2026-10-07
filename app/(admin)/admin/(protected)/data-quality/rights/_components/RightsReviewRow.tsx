"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, useToast } from "@/components/admin/kit";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import { confirmBookRights } from "@/app/actions/book-rights";
import { RIGHTS_BASES } from "@/lib/books/rights";
import { INPUT_CLASS, LABEL_CLASS } from "@/components/admin/kit/form";

export type UIRightsRow = {
  bookId: string;
  title: string;
  slug: string | null;
  publisher: string | null;
  author: string | null;
  isbn: string | null;
  published: boolean;
  basis: string | null;
  draftBasis: string | null;
  draftSource: string | null;
  evidence: string | null;
};

/** One book: what a rule proposed, and the basis a librarian confirms. */
export default function RightsReviewRow({ row }: { row: UIRightsRow }) {
  const t = useTranslations("adminDataQuality.rights");
  const toast = useToast();
  const router = useRouter();
  const allowed = useCan("books.rights.review");
  const [basis, setBasis] = useState(row.basis ?? row.draftBasis ?? "unknown");
  const [evidence, setEvidence] = useState(row.evidence ?? "");
  const [pending, startTransition] = useTransition();
  const selectId = useId();
  const evidenceId = useId();

  function confirm() {
    startTransition(async () => {
      const result = await confirmBookRights({ bookId: row.bookId, basis, evidence });
      if (result.success) {
        toast.success(t("toast.confirmed"));
        router.refresh();
      } else {
        toast.error(t(`errors.${result.code}`));
      }
    });
  }

  const facts = [
    row.author && `${t("fact.author")}: ${row.author}`,
    row.publisher && `${t("fact.publisher")}: ${row.publisher}`,
    row.isbn && `ISBN ${row.isbn}`,
  ].filter(Boolean);

  return (
    <li className="space-y-3 rounded-xl border border-divider bg-bg-surface p-4">
      <div className="min-w-0 space-y-1">
        <p className="font-khmer-serif text-sm font-semibold text-text-heading">
          <Link href={`/admin/edit/${row.bookId}`} className="focus-field rounded hover:text-brand">
            {row.title}
          </Link>
        </p>
        {facts.length > 0 && <p className="text-xs text-text-muted">{facts.join(" · ")}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          {row.draftBasis && (
            <Badge tone="info">
              {t("draftLabel")}: {t(`basis.${row.draftBasis}`)}
              {row.draftSource ? ` · ${t(`source.${row.draftSource.replace("rule:", "")}`)}` : ""}
            </Badge>
          )}
          {row.basis && <Badge tone="success">{t("confirmedLabel")}: {t(`basis.${row.basis}`)}</Badge>}
          {!row.published && <Badge>{t("unpublished")}</Badge>}
        </div>
      </div>

      {allowed && (
        <div className="grid gap-3 border-t border-divider pt-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label htmlFor={selectId} className={`${LABEL_CLASS} mb-1.5 block`}>
              {t("basisLabel")}
            </label>
            <select id={selectId} value={basis} onChange={(e) => setBasis(e.target.value)} className={INPUT_CLASS}>
              {RIGHTS_BASES.map((b) => (
                <option key={b} value={b}>
                  {t(`basis.${b}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={evidenceId} className={`${LABEL_CLASS} mb-1.5 block`}>
              {t("evidenceLabel")}
            </label>
            <input
              id={evidenceId}
              type="text"
              value={evidence}
              maxLength={2000}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder={t("evidencePlaceholder")}
              className={INPUT_CLASS}
            />
          </div>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="focus-field inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover disabled:opacity-50"
          >
            {row.basis ? t("actions.update") : t("actions.confirm")}
          </button>
        </div>
      )}
    </li>
  );
}
