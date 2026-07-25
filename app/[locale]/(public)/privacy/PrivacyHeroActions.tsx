"use client";

import { Link } from "@/i18n/navigation";
import { useSession } from "@/components/providers/SessionProvider";
import { ShieldCheck, Mail, Printer } from "lucide-react";

type Labels = {
  manage: string;
  contact: string;
  print: string;
};

/**
 * Hero action buttons. Client-side only because two of them need the browser:
 * the print trigger (window.print) and the auth-gated "Manage my privacy"
 * button, which appears only for signed-in visitors (identity arrives from
 * SessionProvider, never from the server, so the page HTML stays cacheable).
 *
 * Labels arrive as props — this component reads no translation namespace, so
 * `privacy` need not be registered in PUBLIC_NAMESPACES.
 */
export default function PrivacyHeroActions({ labels }: { labels: Labels }) {
  const { user } = useSession();

  const base =
    "inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:ring-white";

  return (
    <div className="mt-6 flex flex-wrap gap-3 print:hidden">
      {user && (
        <Link
          href="/dashboard/settings"
          className={`${base} bg-white text-brand hover:bg-white/90`}
        >
          <ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />
          {labels.manage}
        </Link>
      )}
      <Link
        href="/contact"
        className={`${base} border border-white/40 text-white hover:bg-white/10`}
      >
        <Mail className="h-[18px] w-[18px]" aria-hidden="true" />
        {labels.contact}
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className={`${base} border border-white/40 text-white hover:bg-white/10`}
      >
        <Printer className="h-[18px] w-[18px]" aria-hidden="true" />
        {labels.print}
      </button>
    </div>
  );
}
