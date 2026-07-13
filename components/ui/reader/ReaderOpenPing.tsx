"use client";

import { useEffect } from "react";
import { recordReaderOpen } from "@/app/actions/reader-events";

/**
 * Logs a "reader opened" funnel event when a reading surface mounts
 * (full-page /read route). The inline PDFReaderLauncher logs on its open
 * click instead. sessionStorage guard: one event per content per tab.
 */
export default function ReaderOpenPing({
  contentType,
  contentId,
}: {
  contentType: "book" | "research_report" | "publication";
  contentId: string;
}) {
  useEffect(() => {
    if (!contentId) return;
    const key = `ptec.readeropen.${contentType}.${contentId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode — ping anyway.
    }
    recordReaderOpen(contentType, contentId).catch(() => {});
  }, [contentType, contentId]);

  return null;
}
