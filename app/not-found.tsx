import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { Pill } from "@/components/ui/Pill";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-[480px] flex-col items-start gap-5 rounded-panel bg-sheet p-6">
        <Logo size="sm" />
        <h1 className="text-[26px] leading-8 tracking-[-0.01em] text-ink">This page doesn&apos;t exist.</h1>
        <div className="flex flex-wrap gap-2">
          <Pill variant="primary" href="/app">
            Open the app
          </Pill>
          <Pill variant="secondary" on="white" href="/">
            Go home
          </Pill>
        </div>
      </div>
    </main>
  );
}
