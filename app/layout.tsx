import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { angkor, battambang } from "@/app/fonts";

export const metadata: Metadata = {
  title: "PTEC e-Library | Phnom Penh Teacher Education College",
  description:
    "The Phnom Penh TEC (P.T.E.C) is established through the combination of the two campuses, Phnom Penh Regional Teacher Training Center and Phnom Penh Municipality Teacher Training Center.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // ⭐ FIX: attach BOTH font variables here so --font-angkor / --font-battambang
    //         exist for the whole app. Without this, font-title / font-body do nothing.
    <html lang="km" className={`${angkor.variable} ${battambang.variable}`}>
      
      {/* Adjusted padding top (pt-[72px]) to match the Navbar height */}
      {/* ⭐ font-body = Battambang is now the default body font for the whole site. */}
      <body
        suppressHydrationWarning
        className="flex min-h-screen flex-col bg-slate-50 pt-[72px] font-body text-slate-900 antialiased"
      >
        <Navbar />
        <main className="flex-grow">{children}</main>
        <Footer />
      </body>
    </html>
  );
}