import { CheckCircle2 } from "lucide-react";

/** "After reading this article…" — a single-column checklist in the text measure. */
export default function LearningOutcomesSection({
  outcomes,
  intro,
}: {
  outcomes: string[];
  intro: string;
}) {
  return (
    <div>
      <p className="mb-3 text-[14.5px] text-text-muted">{intro}</p>
      <ul className="space-y-2.5">
        {outcomes.map((outcome, i) => (
          <li
            key={i}
            className="flex items-start gap-3 text-[15px] leading-7 text-text-body"
          >
            <CheckCircle2 className="mt-1.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span>{outcome}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
