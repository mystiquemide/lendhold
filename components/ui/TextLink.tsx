import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface TextLinkProps {
  href: string;
  external?: boolean;
  children: ReactNode;
  className?: string;
}

export function TextLink({ href, external = false, children, className }: TextLinkProps) {
  const classes = cn("inline-flex items-center gap-1.5 text-base leading-6 text-ink hover:underline", className);
  const body = (
    <>
      {children}
      <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
      {body}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {body}
    </Link>
  );
}
