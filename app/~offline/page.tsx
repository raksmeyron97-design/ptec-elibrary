"use client";

import Image from "next/image";
import Link from "next/link";
import Icon from "@/components/ui/core/Icon";
import { Button } from "@/components/ui/core/Button";

// The PWA offline fallback. Precached by app/sw.ts (it is the only precache
// entry), and served whenever a navigation cannot be answered from the network
// or the page cache.
//
// Bilingual by construction rather than by lookup: this page is precached once,
// in English, and has no access to the visitor's locale — it is served by the
// service worker, below next-intl. Rendering both languages is the only honest
// way to be readable for every reader here, and it matches the boot screen.
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 py-12 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <Image
          src="/pwa/splash/boot-emblem.webp"
          alt=""
          width={72}
          height={72}
          className="mb-6 opacity-90"
          priority
        />

        <h1 className="mb-1 font-khmer-serif text-3xl font-bold text-text-heading">
          You&apos;re offline
        </h1>
        <h2 className="mb-6 font-khmer-serif text-xl font-bold text-text-heading" lang="km">
          មិនមានការតភ្ជាប់អ៊ីនធឺណិត
        </h2>

        <p className="mb-2 text-base text-text-muted">
          PTEC Library needs a connection to load new pages. Books you saved for
          offline reading are still available.
        </p>
        <p className="mb-8 text-sm text-text-muted" lang="km">
          សៀវភៅដែលអ្នកបានរក្សាទុកនៅតែអាចអានបាន។
        </p>

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/offline-books" className="w-full sm:w-auto">
            <Button variant="primary" className="w-full">
              <Icon name="bookmark" className="mr-2 text-lg" />
              Saved books · សៀវភៅរក្សាទុក
            </Button>
          </Link>
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => window.location.reload()}
          >
            Try again · ព្យាយាមម្ដងទៀត
          </Button>
        </div>
      </div>
    </div>
  );
}
