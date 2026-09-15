import { ChevronDown } from "lucide-react";
import type { PublicationFaq } from "@/lib/publications";

/**
 * Native <details> accordion — zero JS, keyboard accessible. The matching
 * FAQPage JSON-LD is emitted by the page, not here.
 */
export default function PublicationFAQ({ faqs }: { faqs: PublicationFaq[] }) {
  return (
    <div className="divide-y divide-divider/70 border-y border-divider/70">
      {faqs.map((faq, i) => (
        <details key={i} className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[15px] font-semibold text-text-heading transition-colors hover:text-brand [&::-webkit-details-marker]:hidden">
            {faq.question}
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <p className="pb-4 text-[14.5px] leading-7 text-text-body">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}
