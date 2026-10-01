import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

const instrument = Instrument_Sans({
  weight: "500",
  subsets: ["latin"],
  variable: "--font-instrument",
});

const plexMono = IBM_Plex_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-plex-mono",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

const description = "Borrow against your tokenized stocks on BNB Chain. Keep them.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Lendhold: borrow against your stocks, keep them", template: "%s | Lendhold" },
  description,
  openGraph: {
    type: "website",
    siteName: "Lendhold",
    title: "Lendhold: borrow against your stocks, keep them",
    description,
  },
  twitter: { card: "summary_large_image", title: "Lendhold: borrow against your stocks, keep them", description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrument.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
