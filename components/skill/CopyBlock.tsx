"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A one-line command with a copy button. */
export function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-canvas py-2 pr-2 pl-4">
      <code className="min-w-0 flex-1 font-mono text-[13px] leading-6 break-all text-ink">{code}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard can be blocked. The command is still selectable.
          }
        }}
        aria-label={copied ? "Copied" : "Copy command"}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-sheet hover:text-ink"
      >
        {copied ? <Check size={18} strokeWidth={1.75} aria-hidden="true" /> : <Copy size={18} strokeWidth={1.75} aria-hidden="true" />}
      </button>
    </div>
  );
}
