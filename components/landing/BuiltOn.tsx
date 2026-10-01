/* eslint-disable @next/next/no-img-element */
const PARTNERS = [
  { name: "BNB Chain", href: "https://www.bnbchain.org", src: "/logos/bnb-chain.svg", w: 319, h: 56, role: "Every transaction settles here" },
  { name: "Lista DAO", href: "https://lista.org", src: "/logos/lista-dao.svg", w: 156, h: 28, role: "Lends the money" },
  { name: "Binance Wallet", href: "https://web3.binance.com", src: "/logos/binance-wallet.svg", w: 82, h: 24, role: "Signs every step" },
  { name: "Ondo", href: "https://ondo.finance", src: "/logos/ondo.svg", w: 96, h: 28, role: "Ondo tokens convert to bStocks" },
] as const;

export function BuiltOn() {
  return (
    <section aria-labelledby="built-on-title" className="bg-sheet">
      <div className="mx-auto max-w-[1224px] px-5 pb-12 md:px-6 md:pb-24">
        <h2 id="built-on-title" className="mb-6 text-sm leading-none uppercase tracking-[0.1em] text-[#333333] md:mb-8">
          Built on
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {PARTNERS.map((p) => (
            <li key={p.name}>
              <a
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-full flex-col items-start gap-5 rounded-3xl bg-canvas p-6 transition-colors duration-150 hover:bg-line md:p-8"
              >
                <span className="flex h-10 items-center">
                  <img src={p.src} alt={p.name} width={p.w} height={p.h} className="h-7 w-auto max-w-full md:h-8" />
                </span>
                <span className="text-[15px] leading-5 text-body">{p.role}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
