import { connection } from "next/server";
import { getStockSnapshot } from "@/lib/engine/snapshot";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function Sep() {
  return (
    <>
      <span className="sr-only">, </span>
      <span aria-hidden="true" className="mx-2 hidden sm:inline">
        ·
      </span>
    </>
  );
}

export async function HeroStrip() {
  await connection();
  let snapshot;
  try {
    snapshot = await getStockSnapshot("NVDA");
  } catch (err) {
    console.error("hero strip unavailable", err);
    return null;
  }
  return (
    <p className="text-center text-sm leading-5 text-muted">
      <span className="sr-only">Live: </span>
      <span className="block whitespace-nowrap sm:inline">
        {snapshot.name} <span className="num text-ink">{usd.format(snapshot.perSharePrice)}</span>
      </span>
      <Sep />
      <span className="block whitespace-nowrap sm:inline">{snapshot.marketLabel}</span>
      <Sep />
      <span className="block whitespace-nowrap sm:inline">Borrow up to {snapshot.safePct}% of its value safely</span>
    </p>
  );
}
