import { Inbox } from "lucide-react";
import { adminListContactMessages } from "@/app/actions/contact-messages";
import InboxClient from "./InboxClient";

export const dynamic = "force-dynamic";

export default async function AdminInboxPage() {
  const initial = await adminListContactMessages({ status: "all", page: 1, pageSize: 20 });

  return (
    <div className="p-6 md:p-10">
      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        <Inbox className="h-6 w-6 text-brand" />
        <h1 className="text-[22px] font-bold text-text-heading">Inbox</h1>
        {initial.counts.new > 0 && (
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold text-white">
            {initial.counts.new} new
          </span>
        )}
        <p className="ml-1 text-[13px] text-text-muted">
          Messages submitted through the public contact form.
        </p>
      </div>

      <InboxClient initial={initial} />
    </div>
  );
}
