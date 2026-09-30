"use client";

import { useTranslations } from "next-intl";
import { LogIn, Quote, Sparkles } from "lucide-react";
import FloatingDock from "@/components/ui/glass/FloatingDock";
import { openLibraryAssistant } from "@/lib/ask/open";
import type { ThesisAccess } from "@/lib/theses/access";
import ReadOnlineButton from "./ReadOnlineButton";
import { useThesisAccess } from "./useThesisAccess";
import { ACCESS_PANEL_ID } from "./styles";

const VERB =
  "flex min-h-12 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-brand px-4 text-[15px] font-bold text-brand-contrast transition-colors hover:bg-brand-hover [&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0";

const ICON =
  "flex h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[16px] bg-glass-selected px-3 text-[13px] font-bold text-brand transition-colors hover:bg-brand hover:text-brand-contrast";

/**
 * Phones only: the access panel's verb, kept within reach once the panel has
 * scrolled away (FloatingDock watches it, and steps aside at the footer). It
 * repeats the panel's answer from the same hook, so it can no more offer a
 * refused PDF than the panel can.
 *
 * It also carries the assistant's entry point: on a thesis page the floating
 * assistant button steps aside on phones (lib/nav/shell-routes.ts), as it does
 * on book and article pages, so there is one floating control per corner. The
 * assistant scopes itself to this thesis from the URL.
 */
export default function ActionDock({
  id,
  recordAccess,
  signInHref,
}: {
  id: string;
  recordAccess: ThesisAccess;
  signInHref: string;
}) {
  const t = useTranslations("thesisDetail");
  const tReader = useTranslations("reader");
  const { access, pending } = useThesisAccess(id, recordAccess);
  const verb = !pending && (access.canRead || access.state === "sign_in");

  return (
    <FloatingDock watchId={ACCESS_PANEL_ID} className="lg:hidden">
      {verb && access.canRead && <ReadOnlineButton className={VERB} />}
      {verb && !access.canRead && (
        <a href={signInHref} className={VERB}>
          <LogIn aria-hidden="true" />
          <span className="truncate">{tReader("signInToRead")}</span>
        </a>
      )}
      {verb ? (
        <a href="#cite" aria-label={t("cite")} title={t("cite")} className={ICON}>
          <Quote className="h-5 w-5" aria-hidden="true" />
        </a>
      ) : (
        // No full text to offer this reader: citing is the next useful thing.
        <a href="#cite" className={VERB}>
          <Quote aria-hidden="true" />
          <span className="truncate">{t("cite")}</span>
        </a>
      )}
      <button
        type="button"
        onClick={() => openLibraryAssistant()}
        aria-label={t("askAboutThesis")}
        title={t("askAboutThesis")}
        className={ICON}
      >
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </button>
    </FloatingDock>
  );
}
