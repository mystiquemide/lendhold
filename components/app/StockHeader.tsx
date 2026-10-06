"use client";

import { useEffect, useState } from "react";
import { fmtUsd, api } from "@/lib/client/api";
import { cn } from "@/components/ui/cn";
import { TokenIcon } from "./token";

export interface StockInfo {
  address: string;
  symbol: string;
  name: string;
  ticker: string;
  logoUrl: string | null;
  perShare: number | null;
  borrowable: boolean;
}

let catalog: Promise<StockInfo[]> | null = null;

/** The bStock catalog, fetched once per page load and shared by every header on screen. */
function loadCatalog(): Promise<StockInfo[]> {
  catalog ??= api<{ stocks: StockInfo[] }>("/api/stocks").then((r) => r.stocks);
  catalog.catch(() => {
    catalog = null;
  });
  return catalog;
}

export function useStock(address: string | null | undefined): StockInfo | null {
  const [stock, setStock] = useState<StockInfo | null>(null);
  useEffect(() => {
    if (!address) return;
    let live = true;
    loadCatalog()
      .then((list) => live && setStock(list.find((s) => s.address.toLowerCase() === address.toLowerCase()) ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [address]);
  return stock;
}

/** Logo, company name, ticker and share price. Falls back to the symbol until the catalog loads. */
export function StockHeader({
  stock,
  fallbackSymbol,
  title,
  subtitle,
  price,
  size = "lg",
  as: Heading = "h1",
  className,
}: {
  as?: "h1" | "h2";
  stock: StockInfo | null;
  fallbackSymbol?: string;
  /** Replaces the company name as the heading, e.g. "Borrow against NVIDIA". */
  title?: string;
  subtitle?: string;
  price?: number | null;
  size?: "lg" | "md";
  className?: string;
}) {
  const ticker = stock?.ticker ?? fallbackSymbol ?? "";
  const shown = price ?? stock?.perShare ?? null;
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <span className={size === "lg" ? "[&>*]:size-14!" : undefined}>
        <TokenIcon src={stock?.logoUrl ?? null} ticker={ticker} />
      </span>
      <div className="min-w-0 flex-1">
        <Heading className={cn("text-balance tracking-[-0.01em] text-ink", size === "lg" ? "text-[26px] leading-8" : "text-[22px] leading-7")}>
          {title ?? stock?.name ?? fallbackSymbol}
        </Heading>
        <p className="num truncate text-[15px] leading-6 text-muted">
          {[ticker, stock?.symbol && stock.symbol !== ticker ? stock.symbol : null, shown != null ? `${fmtUsd(shown)} a share` : null]
            .filter(Boolean)
            .join(" · ")}
          {subtitle ? ` · ${subtitle}` : ""}
        </p>
      </div>
    </div>
  );
}
