import type { CatalogCopy } from "@/app/(admin)/admin/(protected)/catalogs/copy-actions";
import { getTranslations } from 'next-intl/server';

const STATUS_CLASSES: Record<string, string> = {
  available:   "text-emerald-700 bg-emerald-50 border-emerald-200",
  checked_out: "text-amber-700 bg-amber-50 border-amber-200",
  lost:        "text-red-700 bg-red-50 border-red-200",
  damaged:     "text-orange-700 bg-orange-50 border-orange-200",
  on_order:    "text-blue-700 bg-blue-50 border-blue-200",
};

export default async function PhysicalCopiesList({ copies }: { copies: CatalogCopy[] }) {
  const t = await getTranslations('physical');

  if (!copies || copies.length === 0) return null;

  const STATUS_LABELS: Record<string, string> = {
    available:   t('available'),
    checked_out: t('checkedOut'),
    lost:        t('lost'),
    damaged:     t('damaged'),
    on_order:    t('onOrder'),
  };

  return (
    <section
      id="copies"
      className="mt-5 scroll-mt-24 rounded-[24px] border border-divider bg-bg-surface px-7 py-7 shadow-sm"
    >
      <h2 className="font-khmer-serif mb-5 text-[20px] font-bold text-text-heading">
        {t('physicalCopies', { count: copies.length })}
      </h2>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {copies.map((copy) => {
          const statusClass = STATUS_CLASSES[copy.status] ?? STATUS_CLASSES.available;
          const statusLabel = STATUS_LABELS[copy.status] ?? copy.status;
          const location = [copy.holding_library, copy.shelf_location]
            .filter(Boolean)
            .join(' · ');

          return (
            <div
              key={copy.id}
              className="rounded-[14px] border border-divider bg-paper p-4"
            >
              {copy.barcode && (
                <p className="mb-1.5 font-mono text-[11.5px] font-bold tracking-[0.05em] text-text-muted">
                  {copy.barcode}
                </p>
              )}
              {copy.call_number && (
                <p className="text-[13.5px] font-semibold text-text-heading leading-tight">
                  {copy.call_number}
                </p>
              )}
              {location && (
                <p className="mt-0.5 text-[12px] text-text-muted">{location}</p>
              )}
              <span
                className={`mt-2.5 inline-block rounded-[6px] border px-2 py-0.5 text-[11px] font-bold ${statusClass}`}
              >
                {statusLabel}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
