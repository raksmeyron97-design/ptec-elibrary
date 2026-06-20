"use client";

import { useEffect } from "react";
import { incrementResearchViewCount } from "@/app/actions/research";

export default function ResearchViewPing({ id }: { id: string }) {
  useEffect(() => {
    incrementResearchViewCount(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
