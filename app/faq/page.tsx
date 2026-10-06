import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = { title: "FAQ", alternates: { canonical: "/" } };

export default function Page() {
  return <Landing section="faq" />;
}
