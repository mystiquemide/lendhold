import { Suspense } from "react";
import { BuiltOn } from "./BuiltOn";
import { Faq } from "./Faq";
import { FinalCta } from "./FinalCta";
import { Footer } from "./Footer";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { WhoItsFor } from "./WhoItsFor";
import { TheRisk } from "./TheRisk";
import { ThreePoints } from "./ThreePoints";
import { NAV_CTA, NAV_LINKS } from "./nav-links";
import { MotionRoot, Reveal } from "@/components/motion/Motion";
import { NavBar } from "@/components/ui/NavBar";
import { ScrollToSection } from "./ScrollToSection";

export function Landing({ section }: { section?: string }) {
  return (
    <MotionRoot>
      {section && <ScrollToSection id={section} />}
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
        <Reveal>
          <HowItWorks />
        </Reveal>
        <Reveal>
          <WhoItsFor />
        </Reveal>
        <Reveal>
          <Suspense fallback={null}>
            <TheRisk />
          </Suspense>
        </Reveal>
        <Reveal>
          <BuiltOn />
        </Reveal>
        <Reveal>
          <Suspense fallback={null}>
            <Faq />
          </Suspense>
        </Reveal>
        <Reveal>
          <FinalCta />
        </Reveal>
      </main>
      <Footer />
    </MotionRoot>
  );
}
