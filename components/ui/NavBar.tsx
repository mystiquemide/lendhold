"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Logo } from "./Logo";
import { Pill } from "./Pill";

export interface NavBarProps {
  links: { href: string; label: string }[];
  cta?: { label: string; href: string };
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
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const wide = window.matchMedia("(min-width: 992px)");
    const onWide = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 -mb-[72px] w-full px-3 pt-3">
      <div className="nav-glass relative mx-auto flex h-[60px] max-w-[1224px] items-center justify-between rounded-[30px] pl-6 pr-2 backdrop-blur-[12px]">
        <Logo />
        {links.length > 0 && (
          <nav aria-label="Main" className="absolute left-1/2 hidden -translate-x-1/2 lg:block">
            <ul className="flex gap-1">
              {links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="inline-block rounded-pill px-6 py-4 text-sm leading-none text-body transition-[background-color,color,transform] duration-150 ease-out hover:bg-sheet hover:text-ink active:scale-95"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {hasMenu && (
          <>
            {cta && (
              <div className="hidden lg:block">
                <Pill variant="primary" size="md" href={cta.href}>
                  {cta.label}
                </Pill>
              </div>
            )}
            <button
              ref={button}
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex size-11 items-center justify-center rounded-pill text-ink lg:hidden"
            >
              {open ? <X size={24} strokeWidth={1.75} /> : <Menu size={24} strokeWidth={1.75} />}
            </button>
          </>
        )}
      </div>
      {hasMenu && open && (
        <div
          id={menuId}
          className="nav-panel fixed inset-x-3 top-[84px] z-40 flex flex-col gap-1 rounded-[30px] p-3 backdrop-blur-[12px] lg:hidden"
        >
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              onClick={() => close(true)}
              className="rounded-pill px-6 py-5 text-base leading-none text-ink transition-colors duration-150 ease-out hover:bg-sheet"
            >
              {l.label}
            </Link>
          ))}
          {cta && (
            <div className="mt-2" onClick={() => close(true)}>
              <Pill variant="primary" size="lg" fullWidth href={cta.href}>
                {cta.label}
              </Pill>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
