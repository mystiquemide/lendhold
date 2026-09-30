import Link from "next/link";
import { cn } from "./cn";

export interface LogoProps {
  size?: "sm" | "md";
  href?: string;
  className?: string;
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path
        d="M7.5 4.5V20.5A7 7 0 0 0 14.5 27.5H26"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="20" cy="17.5" r="5" className="fill-action" />
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
