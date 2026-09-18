import { getMessages } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * One section of a policy document: an <h2> anchor target, body paragraphs, an
 * optional bulleted list, and an optional emphasised note. `children` slots in
 * whatever extra element the section carries (a table, a stepper, a timeline)
 * after the prose.
 *
 * Content is read as a PLAIN OBJECT from the message catalogue rather than by
 * probing individual keys. That is deliberate: `items` and `note` are optional,
 * and asking next-intl for a key that does not exist fires its missing-message
 * handler — which throws in development and logs on every render in
 * production, for every section that simply has no bullet list.
 *
 * Server component.
 */

type SectionContent = {
  title: string;
  body: string[];
  items?: string[];
  note?: string;
};

export default async function PolicySection({
  namespace,
  id,
  km,
  children,
}: {
  /** Top-level message namespace, e.g. "privacy" or "policy". */
  namespace: string;
  /** Anchor id, and the key under `<namespace>.sections.<id>`. */
  id: string;
  km: boolean;
  children?: ReactNode;
}) {
  const messages = await getMessages();
  const section = (
    messages as Record<string, { sections?: Record<string, SectionContent> } | undefined>
  )[namespace]?.sections?.[id];
  // A section named in the structure but absent from the catalogue renders
  // nothing, rather than an empty heading with a dangling anchor.
  if (!section) return null;

  const headingFont = km ? "font-khmer-serif" : "";
  const body = Array.isArray(section.body) ? section.body : [];
  const items = Array.isArray(section.items) ? section.items : [];
  const note = typeof section.note === "string" ? section.note : null;

  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-28">
      <h2
        id={`${id}-heading`}
        className={`policy-wrap policy-measure text-[22px] font-bold leading-snug text-text-heading ${headingFont}`}
      >
        {section.title}
      </h2>

      {/* `policy-measure` sits HERE and not on the section, so the prose
          gets its ~46rem measure while `children` — a table, a stat grid, a
          stepper — keeps the full width of the content column. */}
      <div className="policy-measure mt-3 space-y-3">
        {body.map((p) => (
          <p key={p} className="policy-copy text-[15.5px] text-text-body">
            {p}
          </p>
        ))}
      </div>

      {items.length > 0 && (
        <ul className="policy-measure mt-4 space-y-2.5">
          {items.map((item) => (
            <li key={item} className="policy-copy flex gap-2.5 text-[15px] text-text-body">
              <CheckCircle2
                className="mt-1 h-[17px] w-[17px] shrink-0 text-brand"
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      {note && (
        <p className="policy-copy policy-measure mt-4 rounded-xl border border-divider bg-bg-app/60 px-4 py-3 text-[14px] text-text-body">
          {note}
        </p>
      )}

      {children}
    </section>
  );
}
