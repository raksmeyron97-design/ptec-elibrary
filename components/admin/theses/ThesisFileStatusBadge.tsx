import { FileCheck2, FileX2, ImageIcon, ImageOff } from "lucide-react";

/** Spec section 28: PDF ready = green, Missing PDF = red, Cover missing = orange. */
export default function ThesisFileStatusBadge({ hasPdf, hasCover }: { hasPdf: boolean; hasCover: boolean }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          hasPdf ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}
      >
        {hasPdf ? <FileCheck2 className="h-3 w-3" /> : <FileX2 className="h-3 w-3" />}
        {hasPdf ? "PDF ready" : "Missing PDF"}
      </span>
      {!hasCover && (
        <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
          <ImageOff className="h-3 w-3" /> No cover
        </span>
      )}
      {hasCover && (
        <span className="sr-only inline-flex items-center gap-1 text-[11px] text-emerald-700">
          <ImageIcon className="h-3 w-3" /> Cover present
        </span>
      )}
    </div>
  );
}
