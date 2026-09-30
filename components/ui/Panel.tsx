import type { ElementType, ReactNode } from "react";
import { cn } from "./cn";

export interface PanelProps {
  as?: ElementType;
  children: ReactNode;
  className?: string;
}

export function Panel({ as: Tag = "div", children, className }: PanelProps) {
  return <Tag className={cn("rounded-panel bg-sheet p-6", className)}>{children}</Tag>;
}
