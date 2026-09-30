import type { ReactNode } from "react";
import { Logo } from "./Logo";

export function AppBar({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-3 z-40 px-4">
      <div className="mx-auto flex h-16 max-w-[480px] items-center justify-between rounded-pill bg-[#f6f6f6e6] px-5 backdrop-blur-[12px]">
        <Logo size="sm" />
        {right}
      </div>
    </header>
  );
}
