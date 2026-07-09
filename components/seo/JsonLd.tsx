/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { headers } from 'next/headers';

// `application/ld+json` is a non-executable data block, so browsers don't
// actually gate it behind CSP script-src (verified: zero CSP violations in
// Chromium against this site's nonce-only script-src). We still carry the
// nonce for defense-in-depth and to match the theme-init script's pattern —
// see app/layout.tsx.
export default async function JsonLd({ data }: { data: any }) {
  const nonce = (await headers()).get('x-nonce') || undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // React deliberately renders an empty nonce on the client (it strips
      // the value from the DOM after hydration so it can't be scraped by
      // other scripts) — that intentionally differs from the server-rendered
      // value, so it must be exempted from the hydration-mismatch check.
      // Same reasoning as the theme-init script in app/layout.tsx.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
