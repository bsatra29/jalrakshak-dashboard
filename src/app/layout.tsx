import type { Metadata } from "next";
import { DM_Mono, DM_Sans, Noto_Sans_Devanagari } from "next/font/google";
import Shell from "@/components/Shell";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"] });
const deva = Noto_Sans_Devanagari({ variable: "--font-deva", subsets: ["devanagari"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "JalRakshak Government Dashboard",
  description: "Water quality monitoring and mining accountability for Jharkhand district administration",
  // Readings are generated, not measured: keep the site out of search results.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmMono.variable} ${deva.variable}`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
