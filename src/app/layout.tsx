import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./ds.css";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Cta } from "@/components/Cta";
import { Footer } from "@/components/Footer";
import { Motion } from "@/components/Motion";
import { getCurrentUser } from "@/lib/auth";
import { SmoothScroll } from "@/components/SmoothScroll";

const barlow = Barlow({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Profect — Öğren. Sına. Belgele.", template: "%s · Profect" },
  description:
    "Profect’te alanında uzman eğitmenlerin hazırladığı kursları kendi hızında tamamla, final sınavını geç ve doğrulanabilir sertifikanı al.",
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="tr" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body>
        <Motion />
        <SmoothScroll />
        <Nav user={user} />
        {children}
        <Cta />
        <Footer />
      </body>
    </html>
  );
}
