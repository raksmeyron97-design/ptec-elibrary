import { BookOpenText, FileX2, Lock } from "lucide-react";
import type { DownloadAccess } from "@/lib/publications/access";

/**
 * Says plainly why the download button is not there.
 *
 * The brief's rule: "Do not hide the permission status completely." A missing
 * button is indistinguishable from a broken page — a reader who came for the
 * PDF should learn, on the page, that the file exists and that the library has
 * chosen to offer it for reading only. Silence reads as a bug and generates a
 * support email.
 *
 * Three states, three different sentences, because they are three different
 * facts about the record:
 *   no-file  — there is nothing to read or download yet.
 *   policy   — the library hosts it and offers online reading only. When the
 *              librarian recorded their own explanation, that is shown instead
 *              of the generic line.
 *   rights   — a third party holds the copyright and we have no verified right
 *              to redistribute the full text.
 *
 * Never colour-only: each state carries an icon and its own wording, so the
 * distinction survives greyscale, low vision, and a screen reader.
 */
export default function PublicationAccessNotice({
  access,
  labels,
}: {
  access: DownloadAccess;
  labels: {
    unavailableHeading: string;
    readOnlyBody: string;
    rightsBody: string;
    noFileHeading: string;
    noFileBody: string;
  };
}) {
  if (access.canDownload || access.reason === null) return null;

  const isMissing = access.reason === "no-file";
  const Icon = isMissing ? FileX2 : access.reason === "policy" ? BookOpenText : Lock;

  const heading = isMissing ? labels.noFileHeading : labels.unavailableHeading;
  const body = isMissing
    ? labels.noFileBody
    : access.reason === "policy"
      ? // The librarian's own words when they wrote any, because they can say
        // something specific ("print embargo until June") that no generic
        // sentence can.
        access.message ?? labels.readOnlyBody
      : labels.rightsBody;

  return (
    <div
      role="note"
      className="mt-4 flex items-start gap-3 rounded-xl border border-divider bg-paper px-4 py-3"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[13.5px] font-bold text-text-heading">{heading}</p>
        <p className="mt-0.5 text-[13px] leading-6 text-text-muted">{body}</p>
      </div>
    </div>
  );
}
