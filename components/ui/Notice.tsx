import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface NoticeProps {
  tone: "info" | "watch" | "risk";
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

const tones = {
  info: { box: "bg-canvas", icon: "text-ink", title: "text-ink", Icon: Info },
  watch: { box: "bg-watch-tint", icon: "text-watch", title: "text-watch", Icon: TriangleAlert },
  risk: { box: "bg-risk-tint", icon: "text-risk", title: "text-risk", Icon: CircleAlert },
} as const;

export function Notice({ tone, title, children, action, className }: NoticeProps) {
  const t = tones[tone];
  return (
    <div role={tone === "risk" ? "alert" : "status"} className={cn("flex gap-3 rounded-panel p-4", t.box, className)}>
      <t.Icon size={20} strokeWidth={1.75} className={cn("mt-0.5 shrink-0", t.icon)} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
        <div className="text-base leading-6 text-ink">
          {title && <p className={cn("mb-1", t.title)}>{title}</p>}
          <p className="text-body">{children}</p>
        </div>
        {action}
      </div>
    </div>
  );
}
