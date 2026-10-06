import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = { title: "How it works", alternates: { canonical: "/" } };

export default function Page() {
  return <Landing section="how-it-works" />;
}
