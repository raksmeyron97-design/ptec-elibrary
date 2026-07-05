"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp } from "lucide-react";
import ReferenceList from "@/components/ui/theses/ReferenceList";

const COLLAPSE_THRESHOLD = 10;

export default function ReferencesSection({ references }: { references: string[] }) {
  const t = useTranslations("publicationDetail");
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = references.length > COLLAPSE_THRESHOLD;
  const visible = shouldCollapse && !expanded ? references.slice(0, COLLAPSE_THRESHOLD) : references;

  return (
    <div>
      <ReferenceList references={visible} />
      {shouldCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-brand transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4" /> {t("showFewerReferences")}
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" /> {t("showAllReferences", { count: references.length })}
            </>
          )}
        </button>
      )}
    </div>
  );
}
