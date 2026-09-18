import type { ReactNode } from "react";
import PolicySection from "@/components/policy/PolicySection";

/**
 * One privacy-policy section. The rendering is shared with /policy
 * (components/policy/PolicySection.tsx); this only binds the namespace, so a
 * change to how a policy section reads lands on both documents at once.
 */
export default function PrivacySection({
  id,
  km,
  children,
}: {
  id: string;
  km: boolean;
  children?: ReactNode;
}) {
  return (
    <PolicySection namespace="privacy" id={id} km={km}>
      {children}
    </PolicySection>
  );
}
