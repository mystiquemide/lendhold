import { Suspense } from "react";
import { HeroStage, Stagger, StaggerItem } from "@/components/motion/Motion";
import { Pill } from "@/components/ui/Pill";
import { HeroCluster } from "./HeroCluster";
import { HeroStrip } from "./HeroStrip";

export function Hero() {
  return (
    <section className="mx-auto w-full max-w-[1224px] px-6 pb-24 pt-[124px]">
      <Stagger className="mx-auto flex max-w-[976px] flex-col items-center gap-6 text-center">
        <h1 className="text-balance text-[38px] leading-[44px] tracking-[-0.02em] text-ink md:text-[56px] md:leading-[59px] lg:text-[72px] lg:leading-[1.05]">
          <StaggerItem className="inline-block">Borrow against your stocks.</StaggerItem>
          <br className="hidden md:block" /> <StaggerItem className="inline-block">Keep them.</StaggerItem>
        </h1>
        <StaggerItem>
        <p className="max-w-[640px] text-pretty text-[17px] leading-[26px] text-body md:text-xl md:leading-[30px]">
          Get dollars on BNB Chain against the tokenized US stocks you hold. You keep the shares, and you see the price
          where risk starts before you sign anything.
        </p>
        </StaggerItem>
        <StaggerItem className="mt-2 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Pill variant="primary" href="/app" className="w-full sm:w-auto">
            See what you can borrow
          </Pill>
          <Pill variant="secondary" on="cloud" href="/how-it-works" className="w-full sm:w-auto">
            How it works
          </Pill>
        </StaggerItem>
        <StaggerItem className="mt-0 w-full">
          <Suspense fallback={<div aria-hidden="true" className="h-5" />}>
            <HeroStrip />
          </Suspense>
        </StaggerItem>
      </Stagger>
      <Suspense
        fallback={
          <div aria-hidden="true" className="cluster-outer mt-16">
            <div className="cluster-frame min-h-[517px] md:min-h-0" />
          </div>
        }
      >
        <HeroStage>
          <HeroCluster />
        </HeroStage>
      </Suspense>
    </section>
  );
}
