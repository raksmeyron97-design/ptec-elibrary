import { CheckCircle2 } from "lucide-react";

/** "After reading this article…" checklist, two columns on wide screens. */
export default function LearningOutcomesSection({
  outcomes,
  intro,
}: {
  outcomes: string[];
  intro: string;
}) {
  return (
    <div>
      <p className="mb-3 text-[13.5px] text-text-muted">{intro}</p>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {outcomes.map((outcome, i) => (
          <li
            key={i}
            className="flex items-start gap-2.5 rounded-xl border border-divider bg-bg-surface px-3.5 py-3 text-[13.5px] leading-6 text-text-body shadow-sm"
          >
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
            <span>{outcome}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
