import { ChevronDown } from "lucide-react";
import type { PublicationFaq } from "@/lib/publications";

/**
 * Native <details> accordion — zero JS, keyboard accessible. The matching
 * FAQPage JSON-LD is emitted by the page, not here.
 */
export default function PublicationFAQ({ faqs }: { faqs: PublicationFaq[] }) {
  return (
    <div className="divide-y divide-divider/60 overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
      {faqs.map((faq, i) => (
        <details key={i} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[14px] font-semibold text-text-heading transition-colors hover:text-brand sm:px-5 [&::-webkit-details-marker]:hidden">
            {faq.question}
            <ChevronDown className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <p className="px-4 pb-4 text-[13.5px] leading-7 text-text-body sm:px-5">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}
