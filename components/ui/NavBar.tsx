"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Logo } from "./Logo";

export interface NavBarProps {
  links: { href: string; label: string }[];
  cta?: ReactNode;
}

export function NavBar({ links, cta }: NavBarProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const hasMenu = links.length > 0 || Boolean(cta);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-3 z-40 px-4">
      <div className="relative mx-auto max-w-[1224px]">
        <div className="flex h-[72px] items-center justify-between rounded-pill bg-[#f6f6f6e6] px-6 backdrop-blur-[12px]">
          <Logo />
          {links.length > 0 && (
            <nav aria-label="Main" className="hidden md:block">
              <ul className="flex items-center gap-8">
                {links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-base leading-6 text-ink hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {hasMenu && (
            <>
              {cta && <div className="hidden md:block">{cta}</div>}
              <button
                ref={button}
                type="button"
                aria-label={open ? "Close menu" : "Open menu"}
                aria-expanded={open}
                aria-controls={menuId}
                onClick={() => setOpen((v) => !v)}
                className="inline-flex size-11 items-center justify-center rounded-pill text-ink md:hidden"
              >
                {open ? <X size={24} strokeWidth={1.75} /> : <Menu size={24} strokeWidth={1.75} />}
              </button>
            </>
          )}
        </div>
        {hasMenu && open && (
          <div id={menuId} className="absolute inset-x-0 top-[84px] rounded-panel bg-sheet p-4 md:hidden">
            <ul className="flex flex-col">
              {links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    onClick={() => close(true)}
                    className="flex min-h-12 items-center px-2 text-lg text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            {cta && (
              <div className="mt-2 flex flex-col [&>*]:w-full" onClick={() => close(true)}>
                {cta}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
