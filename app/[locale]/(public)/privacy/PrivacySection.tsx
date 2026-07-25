import { getMessages } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

type SectionContent = {
  title: string;
  body: string[];
  items?: string[];
  note?: string;
};

/**
 * One policy section: an <h2> anchor target, body paragraphs, an optional
 * bulleted list, and an optional emphasised note. Content is read as a plain
 * object from the message catalogue (`privacy.sections.<id>`) — reading the
 * object directly, rather than probing individual keys, avoids next-intl's
 * missing-message handler firing for sections that have no items/note.
 *
 * `children` slots in the extra element some sections carry (data table,
 * rights card, version history) after the prose.
 */
export default async function PrivacySection({
  id,
  km,
  children,
}: {
  id: string;
  km: boolean;
  children?: ReactNode;
}) {
  const messages = await getMessages();
  const sections = (messages as { privacy?: { sections?: Record<string, SectionContent> } })
    .privacy?.sections;
  const section = sections?.[id];
  if (!section) return null;

  const headingFont = km ? "font-khmer-serif" : "";
  const body = Array.isArray(section.body) ? section.body : [];
  const items = Array.isArray(section.items) ? section.items : [];
  const note = typeof section.note === "string" ? section.note : null;

  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-28">
      <h2
        id={`${id}-heading`}
        className={`text-[22px] font-bold leading-snug text-text-heading ${headingFont}`}
      >
        {section.title}
      </h2>

      <div className="mt-3 space-y-3">
        {body.map((p) => (
          <p key={p} className="text-[15.5px] leading-[1.75] text-text-body">
            {p}
          </p>
        ))}
      </div>

      {items.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 text-[15px] leading-[1.7] text-text-body">
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
        <p className="mt-4 rounded-xl border border-divider bg-bg-app/60 px-4 py-3 text-[14px] leading-relaxed text-text-body">
          {note}
        </p>
      )}

      {children}
    </section>
  );
}
