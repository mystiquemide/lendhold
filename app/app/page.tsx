import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AppGate } from "@/components/app/AppGate";
import { ConnectedHome } from "@/components/app/ConnectedHome";

export default function AppHome() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="inline-flex min-h-11 items-center gap-1 self-start text-[15px] leading-6 text-ink hover:underline">
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
        Back to home
      </Link>
      <AppGate>
        <ConnectedHome />
      </AppGate>
    </div>
  );
}
