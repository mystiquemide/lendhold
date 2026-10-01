import { Suspense } from "react";
import { BuiltOn } from "@/components/landing/BuiltOn";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { WhoItsFor } from "@/components/landing/WhoItsFor";
import { TheRisk } from "@/components/landing/TheRisk";
import { ThreePoints } from "@/components/landing/ThreePoints";
import { NAV_CTA, NAV_LINKS } from "@/components/landing/nav-links";
import { NavBar } from "@/components/ui/NavBar";

export default function Home() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-pill focus:bg-sheet focus:px-5 focus:py-3 focus:text-ink"
      >
        Skip to content
      </a>
      <NavBar links={NAV_LINKS} cta={NAV_CTA} />
      <main id="main">
        <Hero />
        <ThreePoints />
        <HowItWorks />
        <WhoItsFor />
        <Suspense fallback={null}>
          <TheRisk />
        </Suspense>
        <BuiltOn />
        <Suspense fallback={null}>
          <Faq />
        </Suspense>
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
