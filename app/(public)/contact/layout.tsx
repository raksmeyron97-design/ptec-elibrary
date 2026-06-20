import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with PTEC Library. Phone, email, and address for Phnom Penh Teacher Education College — open Mon–Sat, 7 AM–5 PM.",
  alternates: { canonical: `${SITE_URL}/contact` },
  openGraph: {
    title: "Contact PTEC Library",
    description: "Phone, email, and address for PTEC Library. Mon–Sat 7 AM–5 PM, St.271, Khan Toul Kork, Phnom Penh.",
    url: `${SITE_URL}/contact`,
    type: "website",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
