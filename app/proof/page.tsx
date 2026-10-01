import type { Metadata } from "next";
import { ProofRuns } from "@/components/proof/ProofRuns";
import { NAV_CTA, NAV_LINKS } from "@/components/landing/nav-links";
import { NavBar } from "@/components/ui/NavBar";

export const metadata: Metadata = {
  title: "Proof",
  description: "Every finished Lendhold run with its confirmed BNB Chain transactions.",
};

export default function ProofPage() {
  return (
    <>
      <NavBar links={NAV_LINKS} cta={NAV_CTA} />
      <ProofRuns />
    </>
  );
}
