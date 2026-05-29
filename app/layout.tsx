import type { Metadata } from "next";
import "./globals.css";
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
    <html lang="km" className={`${angkor.variable} ${battambang.variable}`}>
      <body
        suppressHydrationWarning
        className="bg-slate-50 font-body text-slate-900 antialiased"
      >
        {children}
      </body>
    </html>
  );
}