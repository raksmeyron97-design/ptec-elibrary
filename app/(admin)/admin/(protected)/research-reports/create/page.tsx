import { createServiceClient } from "@/lib/supabase/server";
import CreateReportForm from "./CreateReportForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function CreateResearchReportPage() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex items-center gap-4">
        <Link 
          href="/admin/research-reports"
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Upload Research Report</h1>
          <p className="text-white/60 text-sm mt-1">Add a new student research report to the repository</p>
        </div>
      </div>

      <CreateReportForm />
    </div>
  );
}
