"use client";

import { useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  BadgeCheck,
  BookOpen,
  Download,
  FileX2,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Quote,
  UserRoundPen,
} from "lucide-react";
import BookmarkButton from "@/components/ui/detail/BookmarkButton";
import ShareButton from "@/components/ui/books/ShareButton";
import { downloadProfileSettingsPath } from "@/lib/security/return-to";
import { downloadThesisPdf } from "@/lib/theses/download-client";
import { TOP_N_PROTECTED, type ThesisAccess } from "@/lib/theses/access";
import ReadOnlineButton from "./ReadOnlineButton";
import { useThesisAccess } from "./useThesisAccess";
import { ACCESS_PANEL_ID, BUTTON_PRIMARY, BUTTON_QUIET, BUTTON_SECONDARY, LABEL } from "./styles";

type Tone = "info" | "success" | "warning" | "neutral";

const TONE: Record<Tone, string> = {
  info: "border-info-line bg-info-soft text-info-text",
  success: "border-success-line bg-success-soft text-success-text",
  warning: "border-warning-line bg-warning-soft text-warning-text",
  neutral: "border-border bg-paper text-text-body [&_strong]:text-text-heading",
};

/**
 * What THIS reader can do with the full text, in one sentence and one button.
 *
 * Every state comes from lib/theses/access.ts — the projection the file and
 * download routes refuse by — so the panel never draws an action the server
 * will answer with 401 or 403. The page's HTML carries the anonymous reader's
 * state; a signed-in reader's arrives from the private status route
 * (useThesisAccess), and while it is on its way the button row is a
 * placeholder, never a "Sign in" shown to someone who is signed in.
 *
 *   open                Full text available — Read online · Download PDF
 *   profile_incomplete  You can read it here — Read online · Complete profile
 *   sign_in             Sign in to read the full text — Sign in to read
 *   protected           Why it is not online, and whom to ask — Contact
 *   no_file             No PDF deposited yet — Request a copy
 *
 * The state line is a live region, so a reader who signs in and comes back
 * hears the new state. Mounted once: the phone dock watches its id.
 */
export default function AccessPanel({
  id,
  title,
  recordAccess,
  path,
  permalink,
  signInHref,
  contactHref,
}: {
  id: string;
  title: string;
  /** The anonymous reader's state, rendered into the cached HTML. */
  recordAccess: ThesisAccess;
  /** This record's locale path — where profile completion returns to. */
  path: string;
  permalink: string;
  signInHref: string;
  contactHref: string;
}) {
  const t = useTranslations("thesisDetail");
  const tDownload = useTranslations("thesisDownload");
  const tReader = useTranslations("reader");
  const locale = useLocale();
  const { access, pending } = useThesisAccess(id, recordAccess);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const download = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setDownloading(true);
    setDownloadError(null);
    try {
      const result = await downloadThesisPdf(id);
      if (!result.ok) {
        setDownloadError(
          result.reason === "NETWORK" ? tDownload("error.generic") : tDownload(`error.${result.reason}`),
        );
      }
    } finally {
      setDownloading(false);
      inFlight.current = false;
    }
  };

  let tone: Tone;
  let icon: ReactNode;
  let heading: string;
  let body: string;
  let actions: ReactNode;

  if (pending) {
    tone = "neutral";
    icon = <Loader2 className="animate-spin motion-reduce:animate-none" />;
    heading = t("accessChecking");
    body = t("accessCheckingBody");
    actions = <span aria-hidden="true" className="skeleton block h-11 w-full rounded-lg" />;
  } else if (access.state === "protected") {
    tone = "warning";
    icon = <Lock />;
    heading = t("accessProtectedTitle");
    body =
      access.blockedBy === "top_ten" && access.rank != null
        ? t("accessProtectedTopTen", { count: TOP_N_PROTECTED, rank: access.rank })
        : t("accessProtectedAdmin");
    actions = (
      <a href={contactHref} className={BUTTON_SECONDARY}>
        <Mail aria-hidden="true" />
        {t("accessContact")}
      </a>
    );
  } else if (access.state === "no_file" || access.state === "unavailable") {
    tone = "neutral";
    icon = <FileX2 />;
    heading = t("noPdf");
    body = t("noPdfPanelBody");
    actions = (
      <a href={contactHref} className={BUTTON_SECONDARY}>
        <Mail aria-hidden="true" />
        {t("requestCopy")}
      </a>
    );
  } else if (access.state === "sign_in") {
    tone = "info";
    icon = <LogIn />;
    heading = t("accessSignInTitle");
    body = t("accessSignInHint");
    actions = (
      <a href={signInHref} className={BUTTON_PRIMARY}>
        <LogIn aria-hidden="true" />
        {tReader("signInToRead")}
      </a>
    );
  } else if (access.state === "profile_incomplete") {
    tone = "success";
    icon = <BookOpen />;
    heading = t("accessProfileTitle");
    body = t("accessProfileBody");
    actions = (
      <>
        {access.canRead && <ReadOnlineButton className={BUTTON_PRIMARY} />}
        <a href={downloadProfileSettingsPath(path, locale)} className={BUTTON_SECONDARY}>
          <UserRoundPen aria-hidden="true" />
          {tDownload("state.completeProfile")}
        </a>
      </>
    );
  } else {
    tone = "success";
    icon = <BadgeCheck />;
    heading = t("accessOpenTitle");
    body = t("accessOpenBody");
    actions = (
      <>
        {access.canRead && <ReadOnlineButton className={BUTTON_PRIMARY} />}
        {access.canDownload && (
          <button type="button" onClick={download} disabled={downloading} className={BUTTON_SECONDARY}>
            {downloading ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Download aria-hidden="true" />
            )}
            {downloading ? tDownload("state.preparing") : tDownload("state.download")}
          </button>
        )}
      </>
    );
  }

  return (
    <section
      id={ACCESS_PANEL_ID}
      aria-labelledby="thesis-access-heading"
      className="rounded-2xl border border-surface-brand-line bg-surface-brand-soft p-4 sm:p-5"
    >
      <h2 id="thesis-access-heading" className={LABEL}>
        {t("accessHeading")}
      </h2>

      <div
        role="status"
        className={`mt-3 flex items-start gap-3 rounded-xl border px-4 py-3 text-[13.5px] leading-5 sm:mt-4 ${TONE[tone]}`}
      >
        <span aria-hidden="true" className="mt-px shrink-0 [&_svg]:h-[18px] [&_svg]:w-[18px]">
          {icon}
        </span>
        <p className="min-w-0">
          <strong className="block font-semibold">{heading}</strong>
          {body}
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:mt-4">{actions}</div>
      {downloadError && (
        <p role="alert" className="mt-2 text-[12.5px] leading-[18px] text-danger-text">
          {downloadError}
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-1 border-t border-surface-brand-line pt-3">
        <BookmarkButton
          id={id}
          contentType="thesis"
          plain
          label={{ saved: t("saved"), unsaved: t("bookmark") }}
          className={BUTTON_QUIET}
        />
        <ShareButton url={permalink} title={title} label={t("share")} className={BUTTON_QUIET} />
        <a href="#cite" className={BUTTON_QUIET}>
          <Quote aria-hidden="true" />
          {t("cite")}
        </a>
      </div>
    </section>
  );
}
