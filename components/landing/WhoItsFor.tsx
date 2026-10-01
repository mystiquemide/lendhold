import { Suspense } from "react";
import { Pill } from "@/components/ui/Pill";
import { LoanPanel } from "./LoanPanel";

export function WhoItsFor() {
  return (
    <section aria-labelledby="who-title" className="bg-sheet">
      <div className="mx-auto max-w-[1224px] px-5 pb-12 md:px-6 md:pb-24">
        <div className="flex flex-col overflow-hidden rounded-[32px] bg-ink md:rounded-[36px] lg:flex-row">
          <div className="flex flex-col items-start gap-6 px-6 pt-10 md:gap-8 md:px-9 md:pt-11 lg:flex-1 lg:justify-center lg:pb-12 lg:pl-12 lg:pr-0 lg:pt-[52px]">
            <div className="flex flex-col gap-3">
              <h2 id="who-title" className="text-balance text-[26px] leading-[30px] tracking-[-0.01em] text-sheet md:text-4xl md:leading-[1.15]">
                Stock money for your business, without selling the stock
              </h2>
              <p className="max-w-[480px] text-pretty text-base leading-6 text-[#c9c9c9] md:text-lg md:leading-normal">
                Borrow what you need now. Repay when sales come in.
              </p>
            </div>
            <Pill variant="secondary" href="/app">
              See what you can borrow
            </Pill>
          </div>
          <Suspense fallback={<div aria-hidden="true" className="hidden lg:block lg:min-h-[420px] lg:flex-1" />}>
            <div className="lg:flex-1 lg:pl-12 lg:pt-[52px]">
              <LoanPanel />
            </div>
          </Suspense>
        </div>
      </div>
    </section>
  );
}
