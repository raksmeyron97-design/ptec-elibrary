import { useTranslations } from "next-intl";
import { Check, Circle } from "lucide-react";
import { passwordRequirements, type PasswordRequirementId } from "@/lib/auth/password-policy";

const LABEL_KEY: Record<PasswordRequirementId, string> = {
  length: "pwReqLength",
  letter: "pwReqLetter",
  number: "pwReqNumber",
};

/**
 * The live checklist from step 9 of the redesign brief. Every line here is
 * something Supabase Auth actually rejects a password for — see the comment
 * in lib/auth/password-policy.ts — so the UI never promises a rule (like a
 * separate uppercase requirement) the backend does not enforce.
 *
 * Status is never colour-only: each row also swaps icon (Check vs an open
 * circle) and re-announces through the `aria-live` region on the panel, so a
 * screen reader hears "8 characters: met" rather than just a colour change.
 */
export default function PasswordRequirements({ password }: { password: string }) {
  const t = useTranslations("auth");
  const requirements = passwordRequirements(password);

  return (
    <div
      aria-live="polite"
      className="mt-2 rounded-lg border border-divider bg-paper px-3 py-2.5"
    >
      <p className="mb-1.5 text-[11px] font-semibold text-text-muted">{t("passwordRequirementsTitle")}</p>
      <ul className="space-y-1">
        {requirements.map((req) => (
          <li key={req.id} className="flex items-center gap-1.5 text-[12.5px]">
            {req.met ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-success-text" strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-text-muted/50" aria-hidden="true" />
            )}
            <span className={req.met ? "text-success-text" : "text-text-muted"}>
              {t(LABEL_KEY[req.id])}
              <span className="sr-only">{req.met ? ` — ${t("pwReqMet")}` : ` — ${t("pwReqUnmet")}`}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
