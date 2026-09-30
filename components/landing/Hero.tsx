import { Suspense } from "react";
import { Pill } from "@/components/ui/Pill";
import { HeroStrip } from "./HeroStrip";

export function Hero() {
  return (
    <section className="mx-auto w-full max-w-[1224px] px-6 pb-24 pt-[124px]">
      <div className="mx-auto flex max-w-[976px] flex-col items-center gap-6 text-center">
        <h1 className="text-balance text-[38px] leading-[44px] tracking-[-0.02em] text-ink md:text-[56px] md:leading-[59px] lg:text-[72px] lg:leading-[1.05]">
          Borrow against your stocks.
          <br className="hidden md:block" /> Keep them.
        </h1>
        <p className="max-w-[640px] text-pretty text-[17px] leading-[26px] text-body md:text-xl md:leading-[30px]">
          Get dollars on BNB Chain against the tokenized US stocks you hold. You keep the shares, and you see the price
          where risk starts before you sign anything.
        </p>
        <div className="mt-2 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Pill variant="primary" href="/app" className="w-full sm:w-auto">
            See what you can borrow
          </Pill>
          <Pill variant="secondary" on="cloud" href="#how-it-works" className="w-full sm:w-auto">
            How it works
          </Pill>
        </div>
      </div>
      <div className="mt-6">
        <Suspense fallback={<div aria-hidden="true" className="h-5" />}>
          <HeroStrip />
        </Suspense>
      </div>
    </section>
  );
}
