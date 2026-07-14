/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

// `application/ld+json` is a non-executable data block, so browsers don't gate
// it behind CSP script-src (verified: zero CSP violations in Chromium against
// this site's nonce-only script-src).
//
// This component used to carry the nonce anyway, "for defence in depth" — but
// reading it meant `await headers()`, and because the institutional @graph is
// emitted on every single page, that one call alone was enough to de-opt the
// ENTIRE app to per-request rendering. It cost every public page its CDN cache
// in exchange for hardening a script type CSP does not check. Do not
// reintroduce it: if a nonce is ever genuinely needed here, it must arrive as a
// prop, never from headers().
export default function JsonLd({ data }: { data: any }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
