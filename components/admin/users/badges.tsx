import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AppRole } from "@/lib/types/roles";
import { ROLE_META } from "@/lib/types/roles";
import { STATUS_META, type AccountStatus } from "@/lib/admin/users-shared";

const pill =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap";

// Labels are translated here at the render site; ROLE_META/STATUS_META keep
// their English labels for non-UI consumers (exports, keyword search).

export function RoleBadge({ role, isSuperAdmin }: { role: AppRole; isSuperAdmin?: boolean }) {
  const t = useTranslations("adminUsers.roles");
  const meta = ROLE_META[role];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${meta.bgColor} ${meta.color} ${meta.borderColor}`}>
      {(role === "super_admin" || isSuperAdmin) && <ShieldCheck className="h-3 w-3" aria-hidden="true" />}
      {t(role)}
    </span>
  );
}

export function StatusBadge({ status }: { status: AccountStatus }) {
  const t = useTranslations("adminUsers.status");
  const m = STATUS_META[status];
  return (
    <span className={`${pill} ${m.text} ${m.bg} ${m.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} aria-hidden="true" />
      {t(status)}
    </span>
  );
}
