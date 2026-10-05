import { Gauge, Link, ShieldCheck, type LucideIcon } from "lucide-react";
import { Reveal } from "@/components/motion/Motion";

const points: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: ShieldCheck,
    title: "Keep your shares",
    body: "Borrow against bStocks directly. Your share count stays the same.",
  },
  {
    Icon: Gauge,
    title: "See the risk first",
    body: "The price where your stock is at risk is on every screen, before you confirm.",
  },
  {
    Icon: Link,
    title: "Checked on BNB Chain",
    body: "A step only counts as done after we confirm it on-chain.",
  },
];

export function ThreePoints() {
  return (
    <section className="mx-auto w-full max-w-[1224px] px-6 pb-24">
      <h2 className="sr-only">Why Lendhold</h2>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {points.map(({ Icon, title, body }, i) => (
          <Reveal
            as="li"
            key={title}
            delay={i * 0.12}
            className="flex flex-col gap-4 rounded-panel bg-canvas p-6 transition-[translate,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-float md:min-h-[225px] md:p-8"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-sheet text-ink">
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-2">
              <h3 className="text-xl leading-[1.2] text-ink">{title}</h3>
              <p className="max-w-[340px] text-[15px] leading-normal text-body">{body}</p>
            </div>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
