import { connection } from "next/server";
import { getConversionExample } from "@/lib/engine/snapshot";

const shares = new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export async function ConvertPanel() {
  await connection();
  let e;
  try {
    e = await getConversionExample("NVDA");
  } catch (err) {
    console.error("how it works conversion panel unavailable", err);
    return null;
  }
  if (!e) return null;
  const before = shares.format(e.sharesBefore);
  const after = shares.format(e.sharesAfter);
  const cost = `${Math.max(e.costPct, 0).toFixed(2)}%`;

  return (
    <div className="ml-6 -mb-7 flex max-w-[calc(100%-24px)] flex-1 flex-col md:ml-9 lg:ml-12">
      <div className="flex-1 rounded-t-3xl border border-line bg-sheet p-7 pb-14">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[17px] leading-6 text-ink">Conversion</p>
          <p className="text-[13px] leading-5 text-muted">Live quote for 1 {e.onSymbol}</p>
        </div>
        <p className="num mt-4 text-[22px] leading-7 text-ink">
          {before} shares become {after} shares
        </p>
        <p className="mt-1 text-[15px] leading-5 text-body">
          {e.onSymbol} to {e.bSymbol}, {cost} cost
        </p>
      </div>
    </div>
  );
}
