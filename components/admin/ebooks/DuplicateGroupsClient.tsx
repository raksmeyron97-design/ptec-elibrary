"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import { retireDuplicateBook } from "@/app/actions/duplicates";
import { ConfirmDialog, EmptyState, useToast } from "@/components/admin/kit";

type UIBook = {
  id: string;
  slug: string;
  title: string;
  isbn: string | null;
  year: number | null;
  author: string | null;
  pages: number | null;
  fileSizeKb: number | null;
  hasHash: boolean;
};

type UIGroup = {
  key: string;
  confidence: "high" | "medium" | "low";
  signals: string[];
  books: UIBook[];
};

const CONFIDENCE_STYLES: Record<UIGroup["confidence"], string> = {
  high: "bg-danger/5 text-danger border-danger/25",
  medium: "bg-warning/5 text-warning border-warning/25",
  low: "bg-paper text-text-muted border-divider",
};

export default function DuplicateGroupsClient({ groups }: { groups: UIGroup[] }) {
  const t = useTranslations("adminDuplicates");

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-6 w-6 text-success" />}
        title={t("empty.title")}
        description={t("empty.description")}
      />
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <DuplicateGroup key={group.key} group={group} />
      ))}
    </div>
  );
}

function DuplicateGroup({ group }: { group: UIGroup }) {
  const t = useTranslations("adminDuplicates");
  const toast = useToast();
  const router = useRouter();
  const [canonicalId, setCanonicalId] = useState<string>(group.books[0]?.id ?? "");
  const [retireTarget, setRetireTarget] = useState<UIBook | null>(null);
  const [pending, startTransition] = useTransition();

  const retire = (retiredId: string) => {
    startTransition(async () => {
      const res = await retireDuplicateBook({ retiredId, canonicalId });
      if (res.success) {
        toast.success(t("toasts.retired", { from: res.redirectFrom, to: res.redirectTo }));
        router.refresh();
      } else {
        toast.error(res.error || t("toasts.failed"));
      }
      setRetireTarget(null);
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-divider bg-paper px-4 py-3">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CONFIDENCE_STYLES[group.confidence]}`}
        >
          {t(`confidence.${group.confidence}`)}
        </span>
        <span className="text-sm text-text-muted">
          {t("records", { count: group.books.length })} ·{" "}
          {group.signals.map((s) => t(`signals.${s}`)).join(", ")}
        </span>
      </div>

      <div className="divide-y divide-divider">
        {group.books.map((book) => {
          const isCanonical = book.id === canonicalId;
          return (
            <div
              key={book.id}
              className={`flex flex-wrap items-center gap-3 px-4 py-3 ${isCanonical ? "bg-success/5" : ""}`}
            >
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`canonical-${group.key}`}
                  checked={isCanonical}
                  onChange={() => setCanonicalId(book.id)}
                  disabled={pending}
                  className="h-4 w-4 accent-emerald-600"
                />
                <span className="sr-only">{t("keepThis")}</span>
              </label>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-text-heading">{book.title}</p>
                  {isCanonical && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> {t("keep")}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-text-muted">
                  /{book.slug}
                  {book.author ? ` · ${book.author}` : ""}
                  {book.year ? ` · ${book.year}` : ""}
                  {book.isbn ? ` · ISBN ${book.isbn}` : ""}
                  {book.fileSizeKb ? ` · ${book.fileSizeKb} KB` : ""}
                  {book.hasHash ? " · hashed" : ""}
                </p>
              </div>

              <Link
                href={`/books/${book.slug}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                {t("view")} <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>

              {!isCanonical && (
                <button
                  type="button"
                  onClick={() => setRetireTarget(book)}
                  disabled={pending}
                  className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-50"
                >
                  {pending ? t("retireDialog.busy") : t("retire")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={retireTarget !== null}
        title={t("retireDialog.title")}
        description={retireTarget ? t("retireDialog.description", { title: retireTarget.title }) : undefined}
        confirmLabel={t("retireDialog.confirm")}
        busyLabel={t("retireDialog.busy")}
        busy={pending}
        onCancel={() => setRetireTarget(null)}
        onConfirm={() => retireTarget && retire(retireTarget.id)}
      />
    </div>
  );
}
