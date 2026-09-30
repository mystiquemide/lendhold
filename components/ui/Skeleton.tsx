import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-input bg-canvas", className)} />;
}
