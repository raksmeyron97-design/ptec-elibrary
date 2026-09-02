"use client";

import { useSearchParams } from "next/navigation";
import OfflineBookReader from "@/components/ui/pwa/OfflineBookReader";

// Reads the book id from the URL on the client. `useSearchParams()` keeps the
// surrounding page prerenderable (the shell is identical for every book) while
// still seeing the real address the visitor opened — including when the service
// worker served this document for a URL it was not rendered with.
export default function OfflineReaderClient() {
  const params = useSearchParams();
  return <OfflineBookReader bookId={params.get("id")} />;
}
