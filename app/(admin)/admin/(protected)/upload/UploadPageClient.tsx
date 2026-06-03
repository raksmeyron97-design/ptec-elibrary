"use client";

import { useState } from "react";
import UploadForm from "../UploadForm";
// Assuming BulkUploadForm is in the same directory as UploadForm
import BulkUploadForm from "../BulkUploadForm";

export default function UploadPageClient() {
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-divider pb-4">
        <button
          onClick={() => setActiveTab("single")}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeTab === "single"
              ? "bg-brand text-white shadow-sm"
              : "text-text-muted hover:bg-bg-surface hover:text-text-body"
          }`}
        >
          Single Upload
        </button>
        <button
          onClick={() => setActiveTab("bulk")}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeTab === "bulk"
              ? "bg-brand text-white shadow-sm"
              : "text-text-muted hover:bg-bg-surface hover:text-text-body"
          }`}
        >
          Bulk Upload
        </button>
      </div>

      {/* Active Form */}
      <div className="min-h-[500px]">
        {activeTab === "single" ? <UploadForm /> : <BulkUploadForm />}
      </div>
    </div>
  );
}
