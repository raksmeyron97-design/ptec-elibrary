import type { Metadata, Viewport } from "next";
import "./globals.css";
import { angkor, kantumruyPro, playfairDisplay, inter, notoSerifKhmer } from "@/app/fonts";

export const metadata: Metadata = {
  title: "PTEC e-Library | Phnom Penh Teacher Education College",
  description:
    "The Phnom Penh TEC (P.T.E.C) is established through the combination of the two campuses, Phnom Penh Regional Teacher Training Center and Phnom Penh Municipality Teacher Training Center.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#172554",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="km" className={`${angkor.variable} ${kantumruyPro.variable} ${playfairDisplay.variable} ${inter.variable} ${notoSerifKhmer.variable}`}>
      <body
        suppressHydrationWarning
        className="bg-bg-app font-sans text-text-body antialiased"
      >
        {children}
      </body>
    </html>
  );
}