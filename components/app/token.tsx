import Image from "next/image";
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
  // 128px source covers the larger header and confirmation sizes on high-density screens.
  return <Image src={src} alt="" width={128} height={128} className="size-10 shrink-0 rounded-full bg-canvas" />;
}
