import type { CatalogCopy } from "@/app/(admin)/admin/(protected)/catalogs/copy-actions";
import Icon from "@/components/ui/core/Icon";

const STATUS_CONFIG: Record<string, { label: string; colorClass: string }> = {
  available: { label: "Available", colorClass: "text-emerald-500 border-emerald-200 bg-bg-surface" },
  checked_out: { label: "Checked Out", colorClass: "text-amber-500 border-amber-200 bg-bg-surface" },
  lost: { label: "Lost", colorClass: "text-red-500 border-red-200 bg-bg-surface" },
  damaged: { label: "Damaged", colorClass: "text-orange-500 border-orange-200 bg-bg-surface" },
  on_order: { label: "On Order", colorClass: "text-blue-500 border-blue-200 bg-bg-surface" },
};

export default function PhysicalCopiesList({ copies }: { copies: CatalogCopy[] }) {
  if (!copies || copies.length === 0) return null;

  return (
    <div className="mt-12 scroll-mt-24">
      <div className="flex items-center gap-4 mb-8">
        <h2 className="font-khmer-serif text-[24px] font-bold text-brand whitespace-nowrap">
          Physical Copies ({copies.length})
        </h2>
        <div className="h-[1px] w-full bg-paper" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {copies.map((copy) => {
          const status = STATUS_CONFIG[copy.status] || STATUS_CONFIG.available;

          return (
            <div key={copy.id} className="relative rounded-sm border border-divider bg-bg-surface p-6 shadow-sm">
              {/* Status Badge Overhang */}
              <div className="absolute top-0 right-4 -translate-y-1/2">
                <span className={`inline-flex items-center px-3 py-1 text-[11px] font-bold tracking-wider border ${status.colorClass}`}>
                  {status.label}
                </span>
              </div>

              {/* Top Row: Barcode & Holding Library */}
              <div className="grid grid-cols-2 gap-4 border-b border-divider pb-4 mb-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">
                    Barcode
                  </p>
                  <p className="text-[17px] font-bold text-brand truncate">
                    {copy.barcode || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">
                    Holding Library
                  </p>
                  <p className="text-[15px] font-bold text-brand truncate">
                    {copy.holding_library || "—"}
                  </p>
                </div>
              </div>

              {/* Bottom Row: Shelf & Call Number */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">
                    <Icon name="map-pin" className="text-[14px]" />
                    Shelf Location
                  </p>
                  <p className="text-[14px] font-semibold text-text-heading truncate">
                    {copy.shelf_location || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">
                    Call Number
                  </p>
                  <p className="text-[14px] font-semibold text-text-heading truncate">
                    {copy.call_number || "—"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
