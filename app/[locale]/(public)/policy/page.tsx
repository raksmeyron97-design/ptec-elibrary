import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const alternates = localeAlternates("/policy", locale);
  return {
    title: "Borrow & Return Policy",
    description: "PTEC Library borrowing rules: return deadlines, damaged material reporting, and digital resource access terms.",
    alternates,
    openGraph: {
      title: "Borrow & Return Policy | PTEC Library",
      description: "Library borrowing rules, return deadlines, and digital resource access terms.",
      url: alternates.canonical,
      type: "website",
    },
  };
}

export default function PolicyPage() {
  return (
    <section className="bg-paper px-6 py-10 md:px-12">
      <div className="mx-auto max-w-[900px] rounded-lg border border-divider bg-bg-surface p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-text-heading">Borrow and return policy</h1>
        <p className="mt-4 leading-8 text-text-body">
          Print materials should be returned by the due date shown on the
          student account. Damaged or lost materials must be reported to the
          library desk. Digital resources remain available through the catalogue
          according to licensing and classroom-use permissions.
        </p>
      </div>
    </section>
  );
}
