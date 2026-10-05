import type { Metadata } from "next";
import { AgentScreen } from "@/components/agent/AgentScreen";
import { AppBar } from "@/components/ui/AppBar";

export const metadata: Metadata = { title: "Agent", robots: { index: false } };

export default function AgentPage() {
  return (
    <>
      <AppBar />
      <main id="main" className="mx-auto w-full max-w-[480px] px-4 pb-16 pt-8">
        <AgentScreen />
      </main>
    </>
  );
}
