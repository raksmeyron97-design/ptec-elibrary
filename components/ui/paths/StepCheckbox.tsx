"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setStepComplete } from "@/app/actions/learning-paths";

export default function StepCheckbox({
  stepId,
  pathId,
  pathSlug,
  initialCompleted,
  isLoggedIn,
}: {
  stepId: string;
  pathId: string;
  pathSlug: string;
  initialCompleted: boolean;
  isLoggedIn: boolean;
}) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [, startTransition] = useTransition();

  function toggle() {
    if (!isLoggedIn) {
      window.location.href = `/auth/login?callbackUrl=/paths/${pathSlug}`;
      return;
    }
    const next = !completed;
    setCompleted(next);
    startTransition(async () => {
      const res = await setStepComplete(stepId, pathId, next);
      if ("error" in res) setCompleted(!next);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={completed}
      aria-label={completed ? "Mark step incomplete" : "Mark step complete"}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        completed
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-divider bg-bg-surface text-transparent hover:border-brand/50"
      }`}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  );
}
