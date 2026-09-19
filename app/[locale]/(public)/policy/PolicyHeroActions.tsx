"use client";

import { Link } from "@/i18n/navigation";
import { BookOpenCheck, Mail, Printer } from "lucide-react";

/**
 * The /policy hero buttons. Client-side only for the print trigger, which
 * needs `window.print()`.
 *
 * Labels arrive as props — this component reads no translation namespace, so
 * `policy` need not be registered in PUBLIC_NAMESPACES (which would serialise
 * the whole policy catalogue into every public page's payload).
 */
export default function PolicyHeroActions({
  labels,
}: {
  labels: { fullRules: string; contact: string; print: string };
}) {
  const base =
    "inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:ring-white";

  return (
    <div className="mt-6 flex flex-wrap gap-3 print:hidden">
      <Link href="/about/rules" className={`${base} bg-white text-brand hover:bg-white/90`}>
        <BookOpenCheck className="h-[18px] w-[18px]" aria-hidden="true" />
        {labels.fullRules}
      </Link>
      <Link href="/contact" className={`${base} border border-white/40 text-white hover:bg-white/10`}>
        <Mail className="h-[18px] w-[18px]" aria-hidden="true" />
        {labels.contact}
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className={`${base} cursor-pointer border border-white/40 text-white hover:bg-white/10`}
      >
        <Printer className="h-[18px] w-[18px]" aria-hidden="true" />
        {labels.print}
      </button>
    </div>
  );
}
