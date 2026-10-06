import data from "@/lib/data/swap-costs.json";
import { utcDate } from "@/components/landing/format";

type Row = (typeof data.rows)[number];

const ISSUERS = [
  { id: "bstock", name: "bStocks", note: "What Lista accepts as collateral" },
  { id: "ondo", name: "Ondo", note: "Converted to the matching bStock before borrowing" },
] as const;

const cost = (r: Row | undefined) => {
  if (!r || r.medianPct === null) return "No route";
  if (r.medianPct >= 50) return "Broken route";
  return `${r.medianPct.toFixed(2)}%`;
};

function find(issuer: string, usd: number, ticker: string | null) {
  return data.rows.find((r) => r.issuer === issuer && r.usd === usd && r.ticker === ticker);
}

export function SwapCosts() {
  return (
    <section aria-labelledby="swap-costs" className="mt-16 flex flex-col gap-6 md:mt-24">
      <div className="flex max-w-[800px] flex-col gap-4">
        <h2 id="swap-costs" className="text-[28px] leading-8 tracking-[-0.01em] text-ink md:text-[34px] md:leading-[38px]">
          What a round trip costs
        </h2>
        <p className="max-w-[640px] text-pretty text-base leading-6 text-body">
          Every {data.everyMinutes} minutes we quote a buy and a sell for each stock token through the Binance Trading API and
          compare them with the reference share price. {data.runs} runs from {utcDate(Date.parse(data.from))} to{" "}
          {utcDate(Date.parse(data.to))}. Median cost of buying and selling straight back.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {ISSUERS.map((issuer) => {
          const tickers = [...new Set(data.rows.filter((r) => r.issuer === issuer.id && r.ticker).map((r) => r.ticker!))];
          const all500 = find(issuer.id, 500, null);
          return (
            <div key={issuer.id} className="flex flex-col gap-4 rounded-3xl bg-sheet p-6 md:p-8">
              <div>
                <h3 className="text-[22px] leading-7 text-ink">{issuer.name}</h3>
                <p className="text-[13px] leading-5 text-muted">
                  {issuer.note}. Route found {all500?.routedPct ?? 0}% of the time at $500.
                </p>
              </div>
              <table className="w-full text-[15px] leading-5">
                <thead>
                  <tr className="text-left text-[13px] text-muted">
                    <th scope="col" className="pb-2 font-normal">Stock</th>
                    <th scope="col" className="pb-2 text-right font-normal">$50</th>
                    <th scope="col" className="pb-2 text-right font-normal">$500</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-line">
                    <th scope="row" className="py-2 text-left font-normal text-ink">All</th>
                    <td className="num py-2 text-right text-ink">{cost(find(issuer.id, 50, null))}</td>
                    <td className="num py-2 text-right text-ink">{cost(all500)}</td>
                  </tr>
                  {tickers.map((t) => (
                    <tr key={t} className="border-t border-line">
                      <th scope="row" className="py-2 text-left font-normal text-body">{t}</th>
                      <td className="num py-2 text-right text-body">{cost(find(issuer.id, 50, t))}</td>
                      <td className="num py-2 text-right text-body">{cost(find(issuer.id, 500, t))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
      <p className="max-w-[640px] text-[13px] leading-5 text-muted">
        Broken route means the quote lost more than half the value, usually a thin multi-hop path. Lendhold blocks swaps
        like that before you sign.
      </p>
    </section>
  );
}
