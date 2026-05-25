"use client";

import { useState, useTransition, useRef } from "react";
import { submitReview } from "@/app/actions/reviews";

type ReviewFormProps = {
  bookId: string;
  bookSlug: string;
  existingRating?: number;
  existingContent?: string | null;
};

export default function ReviewForm({
  bookId,
  bookSlug,
  existingRating,
  existingContent,
}: ReviewFormProps) {
  const [hovered, setHovered] = useState(0);
  const [selected, setSelected] = useState(existingRating ?? 0);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const isEdit = !!existingRating;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("rating", String(selected));

    startTransition(async () => {
      const res = await submitReview(bookId, bookSlug, formData);
      setResult(res);
      if (res.success && !isEdit) {
        formRef.current?.reset();
        setSelected(0);
      }
    });
  }

  const displayRating = hovered || selected;

  const labels: Record<number, string> = {
    1: "Poor",
    2: "Fair",
    3: "Good",
    4: "Very good",
    5: "Excellent",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-1 text-base font-bold text-slate-900">
        {isEdit ? "Update your review" : "Write a review"}
      </h3>
      <p className="mb-5 text-sm text-slate-500">
        {isEdit
          ? "Edit your rating or comment below."
          : "Share your thoughts to help other readers."}
      </p>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        {/* Star picker */}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">
            Your rating <span className="text-red-500">*</span>
          </p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setSelected(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                aria-label={`Rate ${star} out of 5`}
                className="group transition-transform hover:scale-110 active:scale-95"
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`h-9 w-9 transition-colors duration-100 ${
                    star <= displayRating
                      ? "fill-amber-400 stroke-amber-400"
                      : "fill-slate-100 stroke-slate-300"
                  }`}
                  strokeWidth={1.5}
                >
                  <path d="m12 2 3 6.4 7 .8-5.2 4.8 1.4 6.9L12 17.4 5.8 21l1.4-6.9L2 9.2l7-.8L12 2Z" />
                </svg>
              </button>
            ))}

            {/* Label */}
            <span
              className={`ml-3 text-sm font-semibold transition-opacity duration-150 ${
                displayRating ? "opacity-100 text-amber-600" : "opacity-0"
              }`}
            >
              {labels[displayRating] ?? ""}
            </span>
          </div>
          {selected === 0 && result?.success === false && !result.error?.includes("sign") && (
            <p className="mt-1 text-xs text-red-500">Please select a star rating.</p>
          )}
        </div>

        {/* Comment */}
        <div>
          <label
            htmlFor="review-content"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Comment{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="review-content"
            name="content"
            rows={4}
            defaultValue={existingContent ?? ""}
            placeholder="What did you find most useful about this resource?"
            className="w-full resize-none rounded-lg border border-slate-200 p-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15"
          />
        </div>

        {/* Feedback */}
        {result && (
          <div
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold ${
              result.success
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {result.success ? (
              <>
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {isEdit ? "Review updated!" : "Review submitted — thank you!"}
              </>
            ) : (
              <>
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" />
                </svg>
                {result.error}
              </>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || selected === 0}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0a1629] px-5 text-sm font-semibold text-white transition hover:bg-[#007c91] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} className="opacity-25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
              </svg>
              Submitting…
            </>
          ) : isEdit ? (
            "Update review"
          ) : (
            "Submit review"
          )}
        </button>
      </form>
    </div>
  );
}