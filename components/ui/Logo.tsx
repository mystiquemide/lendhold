import Link from "next/link";
import { cn } from "./cn";

export interface LogoProps {
  size?: "sm" | "md";
  href?: string;
  className?: string;
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <rect x="4" y="2" width="6" height="20" rx="3" />
      <rect x="14" y="9" width="6" height="13" rx="3" />
    </svg>
  );
}

export function Logo({ size = "md", href = "/", className }: LogoProps) {
  const sm = size === "sm";
  return (
    <Link
      href={href}
      aria-label="Lendhold home"
      className={cn("inline-flex items-center text-ink", sm ? "gap-1.5" : "gap-2", className)}
    >
      <LogoMark className={sm ? "size-6" : "size-8"} />
      <span className={cn("leading-none tracking-[-0.02em]", sm ? "text-xl" : "text-2xl")}>lendhold</span>
    </Link>
  );
}
