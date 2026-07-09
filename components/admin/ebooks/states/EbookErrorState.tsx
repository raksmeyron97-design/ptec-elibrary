"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function EbookErrorState() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-red-600 shadow-sm">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <p className="text-base font-bold text-red-700">Could not load e-books.</p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700"
      >
        Retry
      </button>
    </div>
  );
}
