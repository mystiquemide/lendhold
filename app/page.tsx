import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { WhoItsFor } from "@/components/landing/WhoItsFor";
import { ThreePoints } from "@/components/landing/ThreePoints";
import { NavBar } from "@/components/ui/NavBar";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#proof", label: "Proof" },
  { href: "/skill", label: "For agents" },
  { href: "#faq", label: "FAQ" },
];

export default function Home() {
  return (
    <>
      <NavBar links={links} cta={{ label: "Open app", href: "/app" }} />
      <main>
        <Hero />
        <ThreePoints />
        <HowItWorks />
        <WhoItsFor />
      </main>
    </>
  );
}
