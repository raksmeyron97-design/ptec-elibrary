"use client";

import Icon from "@/components/ui/core/Icon";
import Link from "next/link";
import { Button } from "@/components/ui/core/Button";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <div className="mb-6 rounded-full bg-divider p-6">
          <svg className="h-12 w-12 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 14.25h6.249c.633 0 1.256.25 1.704.694l1.625 1.624a2.404 2.404 0 001.703.693h6.25M12 18V9m0 0l-3.5 3.5M12 9l3.5 3.5M3 9.75h18" />
          </svg>
        </div>
        
        <h1 className="mb-2 font-khmer-serif text-3xl font-bold text-text-heading">
          You&apos;re offline
        </h1>
        <h2 className="mb-6 font-khmer-serif text-xl font-bold text-text-heading">
          អ្នកកំពុងប្រើប្រាស់ក្រៅបណ្តាញ
        </h2>
        
        <p className="mb-8 text-base text-text-muted">
          It looks like you&apos;ve lost your internet connection. You can still read books that you&apos;ve previously saved for offline use.
        </p>

        <div className="flex w-full flex-col gap-4 sm:flex-row sm:justify-center">
          <Link href="/offline-books" className="w-full sm:w-auto">
            <Button variant="primary" className="w-full">
              <Icon name="bookmark" className="mr-2 text-lg" />
              Saved Books (សៀវភៅរក្សាទុក)
            </Button>
          </Link>
          <Button 
            variant="secondary" 
            className="w-full sm:w-auto"
            onClick={() => window.location.reload()}
          >
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}
