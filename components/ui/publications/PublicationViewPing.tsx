"use client";

import { useEffect } from "react";
import { incrementPublicationViewCount } from "@/app/actions/publications";

export default function PublicationViewPing({ id }: { id: string }) {
  useEffect(() => {
    incrementPublicationViewCount(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
