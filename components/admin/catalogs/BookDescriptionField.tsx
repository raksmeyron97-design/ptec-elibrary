"use client";
// components/admin/catalogs/BookDescriptionField.tsx
//
// "About this book / Description" on the catalogue add and edit forms, with a
// "Fetch from publisher link" bar: paste the publisher's page, and its "About
// this book" text lands in the field (publisher-actions.ts). Nothing is saved
// until the form is; a description already in the field is replaced only
// after the librarian confirms.
//
// The textarea stays uncontrolled and named `description`, so the form's own
// save path — and Fetch by ISBN, which fills it by name — are unchanged. The
// link input has NO name: it is a tool, not a field, and never submits.

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Link2 } from "lucide-react";
import { Field, ButtonBusy, BTN_SECONDARY, INPUT_CLASS } from "@/components/admin/kit/form";
import { ConfirmDialog } from "@/components/admin/kit";
import { fetchPublisherDescription, type PublisherDescriptionResult } from "@/app/(admin)/admin/(protected)/catalogs/publisher-actions";

type Fetched = Extract<PublisherDescriptionResult, { ok: true }>;

const looksLikeLink = (v: string) => /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(v.trim());

export default function BookDescriptionField({
  defaultValue,
  error,
  disabled,
  onChanged,
  className = "",
}: {
  defaultValue?: string | null;
  error?: string;
  disabled?: boolean;
  /** A value set by the fetch fires no form change event — this marks the form dirty. */
  onChanged?: () => void;
  className?: string;
}) {
  const t = useTranslations("adminCatalog.form");
  const tp = useTranslations("adminCatalog.publisherFetch");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok"; fetched: Fetched } | { kind: "error"; message: string } | null>(null);
  const [pending, setPending] = useState<Fetched | null>(null);

  function apply(fetched: Fetched) {
    if (textareaRef.current) textareaRef.current.value = fetched.description;
    setStatus({ kind: "ok", fetched });
    setPending(null);
    onChanged?.();
  }

  async function run() {
    if (inFlight.current || !looksLikeLink(link)) return;
    inFlight.current = true;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetchPublisherDescription(link);
      if (!res.ok) {
        setStatus({ kind: "error", message: tp(`err.${res.error}`) });
        return;
      }
      const current = textareaRef.current?.value.trim() ?? "";
      if (!current) apply(res);
      else if (current === res.description.trim()) setStatus({ kind: "ok", fetched: res });
      else setPending(res);
    } catch {
      setStatus({ kind: "error", message: tp("err.unreachable") });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Field label={t("aboutBook")} htmlFor="f-description" error={error} hint={t("aboutBookHint")}>
        {(p) => (
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">{tp("label")}</span>
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  value={link}
                  disabled={disabled || busy}
                  onChange={(e) => setLink(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter here means "fetch", never "save the whole form".
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void run();
                    }
                  }}
                  placeholder={tp("placeholder")}
                  className={`${INPUT_CLASS} pl-9`}
                />
              </label>
              <button
                type="button"
                onClick={() => void run()}
                disabled={disabled || busy || !looksLikeLink(link)}
                className={BTN_SECONDARY}
              >
                {busy ? <ButtonBusy label={tp("fetching")} /> : tp("fetch")}
              </button>
            </div>
            <textarea
              {...p}
              ref={textareaRef}
              className={`${p.className} h-auto resize-y py-3 leading-relaxed`}
              name="description"
              rows={7}
              defaultValue={defaultValue ?? ""}
              placeholder={t("aboutBookPlaceholder")}
            />
          </div>
        )}
      </Field>

      <div aria-live="polite">
        {status?.kind === "ok" && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-success-text">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {tp("fetched", { host: status.fetched.host, source: tp(`source.${status.fetched.source}`) })}
              {status.fetched.truncated && <span className="block text-warning-text">{tp("truncated")}</span>}
            </span>
          </p>
        )}
        {status?.kind === "error" && (
          <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-warning-text">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{status.message}</span>
          </p>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        tone="brand"
        title={tp("replaceTitle")}
        description={
          pending && (
            <span className="block space-y-2">
              <span className="block">{tp("replaceBody", { host: pending.host })}</span>
              <span className="block max-h-40 overflow-y-auto whitespace-pre-line rounded-lg border border-divider bg-paper p-2 text-xs text-text-body">
                {pending.description}
              </span>
            </span>
          )
        }
        confirmLabel={tp("replaceConfirm")}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && apply(pending)}
      />
    </div>
  );
}
