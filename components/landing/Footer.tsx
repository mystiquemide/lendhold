import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

const PRODUCT = [
  { href: "/app", label: "Open app" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/proof", label: "Proof" },
  { href: "/skill", label: "For agents" },
];

const BUILT_ON = [
  { href: "https://lista.org", label: "Lista Lending" },
  { href: "https://web3.binance.com", label: "Binance Web3 Wallet" },
  { href: "https://www.bnbchain.org", label: "BNB Chain" },
  { href: "https://ondo.finance", label: "Ondo" },
];

const linkClass = "inline-block py-1 text-[15px] leading-6 text-[#c9c9c9] transition-colors duration-150 hover:text-sheet";

export function Footer() {
  return (
    <footer className="bg-footer text-sheet">
      <div className="mx-auto max-w-[1224px] px-5 pb-10 pt-14 md:px-6 md:pt-20">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="flex flex-col items-start gap-4">
            <Logo className="text-sheet!" />
            <p className="max-w-[320px] text-[15px] leading-6 text-[#c9c9c9]">
              Borrow against your tokenized stocks on BNB Chain. Keep them.
            </p>
          </div>
          <nav aria-label="Product">
            <h2 className="mb-4 text-sm leading-none uppercase tracking-[0.1em] text-[#9a9a9a]">Product</h2>
            <ul className="flex flex-col">
              {PRODUCT.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Built on">
            <h2 className="mb-4 text-sm leading-none uppercase tracking-[0.1em] text-[#9a9a9a]">Built on</h2>
            <ul className="flex flex-col">
              {BUILT_ON.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="mt-12 max-w-[880px] border-t border-[#3a3a3a] pt-8 text-[13px] leading-5 text-[#9a9a9a]">
          Lendhold is software. It is not a broker, bank or lender, and nothing here is investment advice. Loans are
          provided by Lista Lending smart contracts on BNB Chain. Tokenized stocks are issued by third parties and are not
          available to US persons or in restricted regions. Borrowing against assets that can fall in price can lead to
          liquidation.
        </p>
      </div>
    </footer>
  );
}
