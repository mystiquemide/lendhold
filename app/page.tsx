import { BuiltOn } from "@/components/landing/BuiltOn";
import { Faq } from "@/components/landing/Faq";
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
      <NavBar links={NAV_LINKS} cta={NAV_CTA} />
      <main>
        <Hero />
        <ThreePoints />
        <HowItWorks />
        <WhoItsFor />
        <TheRisk />
        <BuiltOn />
        <Faq />
      </main>
    </>
  );
}
