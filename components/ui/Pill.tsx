import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "./cn";

export interface PillProps {
  variant: "primary" | "secondary";
  on?: "cloud" | "white";
  size?: "md" | "lg";
  fullWidth?: boolean;
  href?: string;
  external?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: MouseEventHandler<HTMLElement>;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  "aria-label"?: string;
  className?: string;
}

export function Pill({
  variant,
  on = "cloud",
  size = "lg",
  fullWidth = false,
  href,
  external = false,
  type = "button",
  onClick,
  disabled = false,
  loading = false,
  children,
  "aria-label": ariaLabel,
  className,
}: PillProps) {
  const inert = disabled || loading;
  const classes = cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-pill transition-colors duration-150 ease-out",
    size === "lg" ? "px-7 py-4 text-[17px] leading-6" : "px-6 py-3 text-base leading-6",
    fullWidth ? (size === "lg" ? "min-h-14 w-full" : "min-h-11 w-full") : "min-h-11",
    disabled
      ? "cursor-not-allowed bg-line text-muted"
      : variant === "primary"
        ? "bg-action text-on-action hover:bg-action-press active:bg-action-press"
        : on === "white"
          ? "bg-canvas text-ink hover:bg-line active:bg-line"
          : "bg-sheet text-ink hover:bg-[#ececec] active:bg-[#ececec]",
    loading && "cursor-progress",
    className,
  );
  const content = (
    <>
      {children}
      {loading && <LoaderCircle size={16} strokeWidth={1.75} className="animate-spin" aria-hidden="true" />}
    </>
  );

  if (href && !inert) {
    if (external) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={classes} aria-label={ariaLabel} onClick={onClick}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} aria-label={ariaLabel} onClick={onClick}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type={type}
      className={classes}
      disabled={inert}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      onClick={inert ? undefined : onClick}
    >
      {content}
    </button>
  );
}
