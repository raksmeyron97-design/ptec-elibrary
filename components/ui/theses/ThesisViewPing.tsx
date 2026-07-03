"use client";

import { useEffect } from "react";
import { incrementThesisViewCount } from "@/app/actions/theses";

export default function ThesisViewPing({ id }: { id: string }) {
  useEffect(() => {
    incrementThesisViewCount(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
