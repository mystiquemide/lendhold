import { Suspense } from "react";
import { Pill } from "@/components/ui/Pill";
import { ReviewPanel } from "./ReviewPanel";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24">
      <div className="relative z-[1] -mt-[66px] h-[66px] rounded-t-[36px] bg-sheet md:-mt-[60px] md:h-[60px] md:rounded-t-[60px]" />
      <div className="relative z-[1] bg-sheet">
        <div className="mx-auto max-w-[1224px] px-5 pb-12 pt-9 md:px-6 md:pb-24">
          <div className="mb-8 flex max-w-[800px] flex-col gap-4 md:mb-12">
            <p className="text-sm leading-none uppercase tracking-[0.1em] text-[#333333]">How it works</p>
            <h2 className="text-balance text-[34px] leading-[38px] tracking-[-0.015em] text-ink md:text-[44px] md:leading-[48px] lg:text-[56px] lg:leading-[1.05]">
              Cash today. Your stocks stay yours.
            </h2>
          </div>
          <article className="flex flex-col overflow-hidden rounded-[32px] bg-canvas md:rounded-[36px] lg:flex-row">
            <div className="flex flex-col items-start gap-6 px-6 pt-10 md:gap-8 md:px-9 md:pt-11 lg:flex-1 lg:justify-center lg:pb-12 lg:pl-12 lg:pr-0 lg:pt-[52px]">
              <div className="flex flex-col gap-3">
                <h3 className="text-[26px] leading-[30px] tracking-[-0.01em] text-ink md:text-4xl md:leading-[1.15]">
                  Borrow against bStocks
                </h3>
                <p className="max-w-[440px] text-base leading-6 text-body md:text-lg md:leading-normal">
                  Pick a stock you hold, choose an amount inside the safe line, and get dollars. Loans come from Lista
                  Lending on BNB Chain.
                </p>
              </div>
              <Pill variant="primary" href="/app">
                See what you can borrow
              </Pill>
            </div>
            <Suspense fallback={<div aria-hidden="true" className="hidden lg:block lg:min-h-[460px] lg:flex-1" />}>
              <ReviewPanel />
            </Suspense>
          </article>
        </div>
      </div>
    </section>
  );
}
