"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, useToast } from "@/components/admin/kit";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import { INPUT_CLASS, LABEL_CLASS } from "@/components/admin/kit/form";
import { confirmBookClassification } from "@/app/actions/book-classification";
import { RESOURCE_TYPES } from "@/lib/books/classification/draft";

export type UIClassificationRow = {
  bookId: string;
  title: string;
  status: "none" | "draft" | "confirmed";
  rule: string | null;
  resourceType: string | null;
  gradeFrom: number | null;
  gradeTo: number | null;
  partNo: number | null;
};

const toNum = (v: string): number | null => (v.trim() === "" ? null : Number(v));

/** One book: the draft (or the confirmed values), editable, then confirmed. */
export default function ClassificationRow({ row }: { row: UIClassificationRow }) {
  const t = useTranslations("adminDataQuality.classification");
  const toast = useToast();
  const router = useRouter();
  const allowed = useCan("books.classification.review");
  const [type, setType] = useState(row.resourceType ?? "");
  const [from, setFrom] = useState(row.gradeFrom?.toString() ?? "");
  const [to, setTo] = useState(row.gradeTo?.toString() ?? "");
  const [part, setPart] = useState(row.partNo?.toString() ?? "");
  const [pending, startTransition] = useTransition();
  const ids = { type: useId(), from: useId(), to: useId(), part: useId() };

  function confirm() {
    const gradeFrom = toNum(from);
    // A single grade is typed once; "to" defaults to it.
    const gradeTo = toNum(to) ?? gradeFrom;
    startTransition(async () => {
      const result = await confirmBookClassification({
        bookId: row.bookId,
        resourceType: type || null,
        gradeFrom,
        gradeTo,
        partNo: toNum(part),
      });
      if (result.success) {
        toast.success(t("toast.confirmed"));
        router.refresh();
      } else {
        toast.error(t(`errors.${result.code}`));
      }
    });
  }

  return (
    <li className="space-y-3 rounded-xl border border-divider bg-bg-surface p-4">
      <div className="space-y-1">
        <p className="font-khmer-serif text-sm font-semibold text-text-heading">
          <Link href={`/admin/edit/${row.bookId}`} className="focus-field rounded hover:text-brand">
            {row.title}
          </Link>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {row.status === "confirmed" ? <Badge tone="success">{t("confirmedLabel")}</Badge> : <Badge tone="info">{t("draftLabel")}</Badge>}
          {row.rule && <span className="text-xs text-text-muted">{t("ruleLabel", { rule: row.rule })}</span>}
        </div>
      </div>
      {allowed && (
        <div className="grid gap-3 border-t border-divider pt-3 sm:grid-cols-[minmax(0,14rem)_6rem_6rem_6rem_auto] sm:items-end">
          <div>
            <label htmlFor={ids.type} className={`${LABEL_CLASS} mb-1.5 block`}>{t("typeLabel")}</label>
            <select id={ids.type} value={type} onChange={(e) => setType(e.target.value)} className={INPUT_CLASS}>
              <option value="">{t("typeNone")}</option>
              {RESOURCE_TYPES.map((rt) => (
                <option key={rt} value={rt}>{t(`type.${rt}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.from} className={`${LABEL_CLASS} mb-1.5 block`}>{t("gradeFromLabel")}</label>
            <input id={ids.from} type="number" min={0} max={12} inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label htmlFor={ids.to} className={`${LABEL_CLASS} mb-1.5 block`}>{t("gradeToLabel")}</label>
            <input id={ids.to} type="number" min={0} max={12} inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label htmlFor={ids.part} className={`${LABEL_CLASS} mb-1.5 block`}>{t("partLabel")}</label>
            <input id={ids.part} type="number" min={1} max={99} inputMode="numeric" value={part} onChange={(e) => setPart(e.target.value)} className={INPUT_CLASS} />
          </div>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="focus-field inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover disabled:opacity-50"
          >
            {row.status === "confirmed" ? t("actions.update") : t("actions.confirm")}
          </button>
        </div>
      )}
    </li>
  );
}
