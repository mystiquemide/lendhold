import { connection } from "next/server";
import { ChevronDown } from "lucide-react";
import { getShareExample } from "@/lib/engine/snapshot";
import { fmt2 } from "./format";

async function minLoanText(): Promise<string | null> {
  try {
    const e = await getShareExample("NVDA");
    return `${fmt2(e.minLoan)} ${e.loanSymbol}`;
  } catch (err) {
    console.error("faq minimum loan unavailable", err);
    return null;
  }
}

export async function Faq() {
  await connection();
  const minLoan = await minLoanText();
  const items = [
    {
      q: "What is Lendhold?",
      a: "An app that lets you borrow dollars against tokenized US stocks you hold on BNB Chain. It plans each step, checks it, and shows the result on-chain.",
    },
    {
      q: "Who lends the money?",
      a: "Lista Lending, a lending protocol on BNB Chain. Lendhold is software. It is not a lender, and your stock sits in Lista's contract, not with us.",
    },
    {
      q: "What happens if my stock falls?",
      a: "If the price reaches the risk price, part of your stock is sold to repay the loan. You can repay or add stock at any time to move the risk price lower.",
    },
    {
      q: "What does it cost?",
      a: "Lista's interest, shown before you confirm, plus BNB Chain gas, usually a few cents. Swaps show their exact cost.",
    },
    {
      q: "Is there a minimum?",
      a: minLoan
        ? `Yes. Lista's minimum loan is ${minLoan}, and Lendhold won't plan a smaller one.`
        : "Yes. Lista sets a minimum loan, and Lendhold won't plan a smaller one. The app shows the current minimum before you confirm.",
    },
    {
      q: "Which stocks work?",
      a: "bStocks directly. Ondo tokens after conversion, while their market is open. xStocks aren't supported on BNB Chain yet.",
    },
    {
      q: "Who can use it?",
      a: "People outside the US and other restricted regions. The token issuers and Binance set who is eligible.",
    },
  ];

  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24 bg-sheet">
      <div className="mx-auto max-w-[848px] px-5 pb-12 md:px-6 md:pb-24">
        <div className="mb-8 flex flex-col gap-4 md:mb-12">
          <p className="text-sm leading-none uppercase tracking-[0.1em] text-[#333333]">Questions</p>
          <h2
            id="faq-title"
            className="text-balance text-[34px] leading-[38px] tracking-[-0.015em] text-ink md:text-[44px] md:leading-[48px] lg:text-[56px] lg:leading-[1.05]"
          >
            Lendhold FAQs
          </h2>
        </div>
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <details key={item.q} className="group rounded-3xl bg-canvas">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6 text-lg leading-6 text-ink md:px-8 md:text-xl md:leading-7 [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown
                  size={20}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="shrink-0 transition-transform duration-150 group-open:rotate-180"
                />
              </summary>
              <p className="-mt-2 px-6 pb-6 text-base leading-6 text-body md:px-8 md:text-[17px] md:leading-[26px]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
