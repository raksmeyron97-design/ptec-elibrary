"use client";

import { useEffect } from "react";
import { incrementPublicationViewCount } from "@/app/actions/publications";

export default function PublicationViewPing({ id }: { id: string }) {
  useEffect(() => {
    if (!id) return;
    // One event per resource per tab session — guards against StrictMode
    // double-invocation and soft-navigation re-mounts inflating analytics.
    const key = `ptec.viewped.publication.${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode — ping anyway.
    }
    incrementPublicationViewCount(id).catch(() => {});
  }, [id]);
  return null;
}
