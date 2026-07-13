"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

function SectionError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("adminDashboard.states");
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-divider bg-bg-surface px-4 py-8 text-center shadow-sm">
      <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />
      <p className="text-[13px] font-semibold text-text-heading">{t("sectionError")}</p>
      <p className="max-w-sm text-[12px] text-text-muted">{t("sectionErrorHint")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
        {t("retry")}
      </button>
    </div>
  );
}

class Boundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <SectionError
          onRetry={() => {
            this.setState({ failed: false });
            this.props.onRetry();
          }}
        />
      );
    }
    return this.props.children;
  }
}

/**
 * Per-section error isolation: one failing widget renders a retry card while
 * the rest of the dashboard stays alive. Retry refreshes the server data.
 */
export default function SectionBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <Boundary onRetry={() => router.refresh()}>{children}</Boundary>;
}
