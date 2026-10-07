"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError, fmtUsd, GENERIC_ERROR } from "@/lib/client/api";
import { TokenIcon } from "./token";

interface Stock {
  address: string;
  symbol: string;
  name: string;
  ticker: string;
  logoUrl: string | null;
  perShare: number | null;
  borrowable: boolean;
}

export function StockPicker() {
  const [stocks, setStocks] = useState<Stock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    const load = () => api<{ stocks: Stock[] }>("/api/stocks");
    // One quiet retry: a cold server can hit Binance's rate limit on the first load.
    load()
      .catch(() => new Promise<{ stocks: Stock[] }>((res, rej) => setTimeout(() => load().then(res, rej), 2000)))
      .then((r) => live && setStocks(r.stocks))
      .catch((err) => live && setError(err instanceof ApiError ? err.message : GENERIC_ERROR));
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!stocks || !q) return stocks;
    return stocks.filter((s) => `${s.name} ${s.ticker} ${s.symbol}`.toLowerCase().includes(q));
  }, [stocks, query]);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/app" className="inline-flex min-h-11 items-center gap-1 self-start text-[15px] leading-6 text-ink hover:underline">
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
        Your stocks
      </Link>
      <div>
        <h1 className="text-[26px] leading-8 tracking-[-0.01em] text-ink">Buy a stock</h1>
        <p className="text-[15px] leading-6 text-body">
          bStocks on BNB Chain, paid with USDT. Stocks marked Can borrow work as collateral on Lista.
        </p>
      </div>

      <label className="flex items-center gap-2 rounded-input border border-line bg-sheet px-4 focus-within:border-action">
        <Search size={18} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden="true" />
        <span className="sr-only">Search stocks</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or ticker"
          autoComplete="off"
          className="min-h-12 w-full bg-transparent text-base text-ink outline-none placeholder:text-muted focus-visible:outline-none"
        />
      </label>

      {error && <Notice tone="risk">{error}</Notice>}

      {!shown && !error && (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2" aria-busy="true" aria-label="Loading stocks">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-panel bg-sheet!" />
          ))}
        </div>
      )}

      {shown && shown.length === 0 && (
        <p className="rounded-panel bg-sheet p-6 text-[15px] leading-6 text-body">
          No stock matches &quot;{query}&quot;. Try a ticker like NVDA or TSLA.
        </p>
      )}

      {shown && shown.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {shown.map((s) => (
            <li key={s.address}>
              <Link
                href={`/app/buy/${s.address}`}
                className="flex items-center gap-3 rounded-panel bg-sheet p-4 transition-colors duration-150 hover:bg-[#fbfbfb]"
              >
                <TokenIcon src={s.logoUrl} ticker={s.ticker} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base leading-6 text-ink">{s.name}</p>
                    {s.borrowable && (
                      <span className="shrink-0 rounded-pill bg-safe-tint px-2 py-0.5 text-xs leading-4 text-safe">Can borrow</span>
                    )}
                  </div>
                  <p className="num text-[13px] leading-5 text-muted">
                    {s.ticker} · {s.perShare === null ? "Price unavailable" : `${fmtUsd(s.perShare)} a share`}
                  </p>
                </div>
                <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
