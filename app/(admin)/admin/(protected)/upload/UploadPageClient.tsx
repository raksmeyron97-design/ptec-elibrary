"use client";

import { useState } from "react";
import UploadForm from "../UploadForm";
import BulkUploadForm from "../BulkUploadForm";

export default function UploadPageClient() {
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 rounded-2xl border border-divider bg-bg-surface p-1.5 w-fit shadow-sm">
        {(["single", "bulk"] as const).map((tab) => {
          const active = activeTab === tab;
          return (
            <button type="button" onClick={() => setActiveTab(tab)}
              className="relative px-5 py-2 text-sm font-semibold rounded-xl transition-all duration-200"
              style={
                active
                  ? { background: "linear-gradient(135deg,#1E3A8A,#2A47A6)", color: "#fff", boxShadow: "0 2px 8px rgba(30,58,138,0.25)" }
                  : { color: "var(--ptec-text-muted)" }
              }
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.color = "var(--ptec-text-body)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.color = "var(--ptec-text-muted)";
              }}
            >
              {tab === "single" ? "Single Upload" : "Bulk Upload"}
            </button>
          );
        })}
      </div>

      <div className="min-h-[500px]">
        {activeTab === "single" ? <UploadForm /> : <BulkUploadForm />}
      </div>
    </div>
  );
}
