'use client'

// components/ui/NavigationProgress.tsx
// The thin bar that sweeps across the top of the page after a client-side
// navigation. One element, re-mounted per navigation (keyed on the URL), and
// ONE CSS keyframe (`.nav-progress` in app/globals.css) that moves it with
// transform and fades it with opacity — the compositor does the rest.
//
// It used to step its WIDTH through five setTimeout calls: five React renders
// and five layouts per navigation, each repainting a glowing box-shadow. On a
// 4x-throttled phone that was main-thread work landing exactly when the new
// page was trying to hydrate. Hidden under reduced motion.

import { usePathname, useSearchParams } from 'next/navigation'

export default function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return <div key={`${pathname}?${searchParams.toString()}`} aria-hidden className="nav-progress" />
}
