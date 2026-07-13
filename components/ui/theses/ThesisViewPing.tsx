"use client";

import { useEffect } from "react";
import { incrementThesisViewCount } from "@/app/actions/theses";

export default function ThesisViewPing({ id }: { id: string }) {
  useEffect(() => {
    if (!id) return;
    // One event per resource per tab session — guards against StrictMode
    // double-invocation and soft-navigation re-mounts inflating analytics.
    const key = `ptec.viewped.thesis.${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode — ping anyway.
    }
    incrementThesisViewCount(id).catch(() => {});
  }, [id]);
  return null;
}
