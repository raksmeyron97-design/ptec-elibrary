"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";

/**
 * The DOI, where a scholar looks for it: labelled, in full, resolvable and
 * copyable. It used to be 11.5 px muted mono in the masthead's corner — the
 * article's permanent identifier was the least visible text in the header.
 *
 * `doi` arrives already normalised by lib/seo/identifiers (`normalizeDoi`), the
 * same validation Scholar tags and JSON-LD use, and `href` is its `doiUrl`. A
 * placeholder or malformed DOI never reaches this component.
 */
export default function ArticleDoi({ doi, href }: { doi: string; href: string }) {
  const t = useTranslations("publicationDetail");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(doi);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the DOI is plain, selectable text */
    }
  };

  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-text-muted">DOI</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all font-mono text-[14.5px] text-brand underline decoration-brand/30 underline-offset-[3px] transition-colors hover:decoration-brand"
      >
        {doi}
        <span className="sr-only"> ({t("doiOpensNewTab")})</span>
      </a>
      <button
        type="button"
        onClick={copy}
        className="-my-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-text-muted transition-colors hover:bg-paper hover:text-brand"
      >
        {copied ? (
          <Check className="h-4 w-4 text-success" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        {copied ? t("doiCopied") : t("doiCopy")}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? t("doiCopied") : ""}
      </span>
    </p>
  );
}
