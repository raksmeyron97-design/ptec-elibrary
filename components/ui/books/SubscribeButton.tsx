"use client";

import { useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { toggleSubscription } from "@/app/actions/subscriptions";

type Props = {
  filterType:         "department" | "category";
  filterValue:        string;
  displayLabel:       string;
  initialSubscribed:  boolean;
};

export default function SubscribeButton({
  filterType, filterValue, displayLabel, initialSubscribed,
}: Props) {
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [flash, setFlash]           = useState<string | null>(null);
  const [pending, start]            = useTransition();

  const handleClick = () => {
    start(async () => {
      const { subscribed: next } = await toggleSubscription(filterType, filterValue, displayLabel);
      setSubscribed(next);
      setFlash(next ? `Subscribed to ${displayLabel}` : `Unsubscribed`);
      setTimeout(() => setFlash(null), 2500);
    });
  };

  return (
    <div className="relative inline-block group">
      <button
        onClick={handleClick}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-all duration-150 cursor-pointer disabled:opacity-50 ${
          subscribed
            ? "border-brand/30 bg-brand/10 text-brand hover:bg-red-50 hover:text-red-600 hover:border-red-300"
            : "border-divider bg-paper text-text-muted hover:border-brand/30 hover:text-brand hover:bg-brand/5"
        }`}
      >
        <Bell className={`h-3 w-3 ${subscribed ? "fill-current" : ""}`} />
        {subscribed ? "Subscribed" : "Subscribe"}
      </button>

      {!flash && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-max max-w-[220px] whitespace-normal rounded-[8px] bg-gray-900 px-3 py-2 text-center text-[11.5px] leading-[1.4] font-medium text-white shadow-xl opacity-0 transition-opacity duration-150 pointer-events-none group-hover:opacity-100 dark:bg-gray-800">
          {subscribed
            ? "ឈប់ទទួលការជូនដំណឹងពីផ្នែកនេះ"
            : "ទទួលបានការជូនដំណឹងពេលមានសៀវភៅថ្មីៗក្នុងផ្នែកនេះ"}
          <div className="absolute -top-[4px] left-1/2 -translate-x-1/2 border-[5px] border-transparent border-b-gray-900 dark:border-b-gray-800"></div>
        </div>
      )}

      {flash && (
        <div className="absolute top-full left-0 mt-1.5 z-10 whitespace-nowrap rounded-lg border border-divider bg-bg-surface px-2.5 py-1.5 text-[11px] font-medium text-text-body shadow-md pointer-events-none">
          {flash}
        </div>
      )}
    </div>
  );
}
