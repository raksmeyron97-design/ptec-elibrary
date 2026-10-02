import { BookOpenText, ExternalLink, FileX2, Lock } from "lucide-react";
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
  citationOnly = false,
}: {
  access: DownloadAccess;
  /**
   * A citation-only record (no PDF, decision 2026-10-02) that links to the
   * publisher. Not a missing file: the full text is THERE, and the page says
   * so instead of "no file attached".
   */
  citationOnly?: boolean;
  labels: {
    unavailableHeading: string;
    readOnlyBody: string;
    rightsBody: string;
    noFileHeading: string;
    noFileBody: string;
    citationOnlyBody: string;
  };
}) {
  if (access.canDownload || access.reason === null) return null;

  const isMissing = access.reason === "no-file";
  const Icon = isMissing ? (citationOnly ? ExternalLink : FileX2) : access.reason === "policy" ? BookOpenText : Lock;

  // One line under the buttons, not a boxed notice: the sentence is what a
  // reader needs, and the box was ~80 px of the header (articles redesign).
  const body = isMissing
    ? citationOnly
      ? labels.citationOnlyBody
      : `${labels.noFileHeading}. ${labels.noFileBody}`
    : access.reason === "policy"
      ? // The librarian's own words when they wrote any, because they can say
        // why ("embargoed until print") where the generic line cannot.
        access.message ?? labels.readOnlyBody
      : labels.rightsBody;

  return (
    <p role="note" className="mt-2.5 flex items-start gap-2 text-[13px] leading-6 text-text-muted">
      <Icon className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{body}</span>
    </p>
  );
}
