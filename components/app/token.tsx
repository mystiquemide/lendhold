export const HEALTH = {
  safe: { label: "Safe", cls: "bg-safe-tint text-safe" },
  watch: { label: "Watch", cls: "bg-watch-tint text-watch" },
  at_risk: { label: "At risk", cls: "bg-risk-tint text-risk" },
} as const;

export function TokenIcon({ src, ticker }: { src: string | null; ticker: string }) {
  if (!src) {
    return (
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-canvas text-[13px] text-ink">
        {ticker.slice(0, 2)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={40} height={40} className="size-10 shrink-0 rounded-full bg-canvas" />;
}
