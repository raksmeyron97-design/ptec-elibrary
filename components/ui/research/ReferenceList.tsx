import { Fragment } from "react";

/** Turn bare URLs and doi.org links inside a reference string into anchors. */
function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
      >
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export default function ReferenceList({ references }: { references: string[] }) {
  if (!references.length) {
    return (
      <p className="text-[14px] text-text-muted">
        No references have been added for this report.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {references.map((ref, i) => (
        <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-text-body">
          <span className="select-none pt-0.5 font-mono text-[12px] font-semibold text-brand">
            {i + 1}.
          </span>
          <span className="min-w-0 break-words">{linkify(ref)}</span>
        </li>
      ))}
    </ol>
  );
}
