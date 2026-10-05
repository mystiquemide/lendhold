"use client";

import { useEffect } from "react";
import { Logo } from "./Logo";
import { Pill } from "./Pill";

/** Shared body for the error boundaries: a message and a full reload, which restores saved state. */
export function ErrorView({ error, message }: { error: Error & { digest?: string }; message: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-[480px] flex-col items-start gap-5 rounded-panel bg-sheet p-6">
        <Logo size="sm" />
        <h1 className="text-[22px] leading-7 text-ink">{message}</h1>
        <Pill variant="primary" onClick={() => window.location.reload()}>
          Reload
        </Pill>
      </div>
    </div>
  );
}
