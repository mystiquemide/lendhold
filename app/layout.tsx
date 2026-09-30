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

export const metadata: Metadata = {
  title: "Lendhold",
  description: "Borrow against your tokenized stocks on BNB Chain. Keep them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrument.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
