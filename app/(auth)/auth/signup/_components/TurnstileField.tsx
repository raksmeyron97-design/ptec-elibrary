"use client";

import { forwardRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Loader2 } from "lucide-react";

/**
 * Turnstile, given its own fixed-height slot.
 *
 * The widget injects a same-origin iframe asynchronously — until it does,
 * the space it will occupy (65px, Turnstile's "normal" size) is reserved by
 * this wrapper so the form doesn't jump once it appears. Nothing here
 * weakens the check: `siteKey`, `onSuccess`/`onExpire`/`onError` and the
 * imperative `.reset()` behave exactly as before, forwarded through.
 */
const TurnstileField = forwardRef<TurnstileInstance, {
  onSuccess: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
}>(function TurnstileField({ onSuccess, onExpire, onError }, ref) {
  const t = useTranslations("auth");
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative flex min-h-[65px] w-full items-center justify-center">
      {!loaded && (
        <div
          role="status"
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg border border-divider bg-paper text-xs text-text-muted"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("verifyingLoading")}
        </div>
      )}
      <Turnstile
        ref={ref}
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
        onWidgetLoad={() => setLoaded(true)}
        onSuccess={onSuccess}
        onExpire={onExpire}
        onError={onError}
        className={loaded ? "opacity-100" : "opacity-0"}
      />
    </div>
  );
});

export default TurnstileField;
