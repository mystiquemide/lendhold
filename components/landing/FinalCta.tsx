import { Suspense } from "react";
import { connection } from "next/server";
import { Pill } from "@/components/ui/Pill";
import { getShareExample } from "@/lib/engine/snapshot";
import { PhonePanel } from "./PhonePanel";

async function Phone() {
  await connection();
  let e;
  try {
    e = await getShareExample("NVDA");
  } catch (err) {
    console.error("final cta phone unavailable", err);
    return null;
  }
  return (
    <div className="flex justify-center px-6 pt-10 lg:flex-1 lg:items-end lg:pt-12">
      <div className="-mb-16">
        <PhonePanel example={e} floating={false} />
      </div>
    </div>
  );
}

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="bg-sheet">
      <div className="mx-auto max-w-[1224px] px-5 pb-12 md:px-6 md:pb-24">
        <div className="flex flex-col overflow-hidden rounded-[32px] bg-canvas md:rounded-[36px] lg:flex-row">
          <div className="flex flex-col items-start gap-6 px-6 pt-10 md:gap-8 md:px-9 md:pt-11 lg:flex-1 lg:justify-center lg:py-12 lg:pl-12 lg:pr-0">
            <div className="flex flex-col gap-3">
              <h2
                id="cta-title"
                className="text-balance text-[26px] leading-[30px] tracking-[-0.01em] text-ink md:text-4xl md:leading-[1.15] lg:text-[44px] lg:leading-[48px]"
              >
                See what your stocks can borrow
              </h2>
              <p className="max-w-[440px] text-pretty text-base leading-6 text-body md:text-lg md:leading-normal">
                Connect your wallet. It takes about a minute to see your safe
                amount.
              </p>
            </div>
            <Pill variant="primary" href="/app">
              Open app
            </Pill>
          </div>
          <Suspense
            fallback={
              <div
                aria-hidden="true"
                className="hidden lg:block lg:min-h-[420px] lg:flex-1"
              />
            }
          >
            <Phone />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
