"use client";

import { useState, useTransition } from "react";
import { GraduationCap, Check } from "lucide-react";
import { enrollInPath } from "@/app/actions/learning-paths";

export default function EnrollButton({
  pathId,
  pathSlug,
  initialEnrolled,
  isLoggedIn,
}: {
  pathId: string;
  pathSlug: string;
  initialEnrolled: boolean;
  isLoggedIn: boolean;
}) {
  const [enrolled, setEnrolled] = useState(initialEnrolled);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!isLoggedIn) {
      window.location.href = `/auth/login?callbackUrl=/paths/${pathSlug}`;
      return;
    }
    if (enrolled) return;
    setEnrolled(true);
    startTransition(async () => {
      const res = await enrollInPath(pathId);
      if ("error" in res) setEnrolled(false);
    });
  }

  if (enrolled) {
    return (
      <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/10 dark:text-emerald-400">
        <Check className="h-4 w-4" />
        Enrolled
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="btn-brand-gradient inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GraduationCap className="h-4 w-4" />
      Start this path
    </button>
  );
}
