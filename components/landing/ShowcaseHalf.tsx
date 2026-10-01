import type { ReactNode } from "react";
import { Pill } from "@/components/ui/Pill";

export function ShowcaseHalf({
  title,
  body,
  cta,
  href,
  children,
}: {
  title: string;
  body: string;
  cta: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[32px] bg-canvas md:rounded-[36px]">
      <div className="flex flex-col items-start gap-6 px-6 pt-10 pb-8 md:gap-8 md:px-9 md:pb-10 md:pt-11 lg:px-12 lg:pt-[52px]">
        <div className="flex flex-col gap-3">
          <h3 className="text-[26px] leading-[30px] tracking-[-0.01em] text-ink md:text-4xl md:leading-[1.15]">
            {title}
          </h3>
          <p className="max-w-[440px] text-base leading-6 text-body md:text-lg md:leading-normal">{body}</p>
        </div>
        <Pill variant="primary" href={href}>
          {cta}
        </Pill>
      </div>
      {children}
    </article>
  );
}
