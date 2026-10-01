import type { Metadata } from "next";
import { AppBar } from "@/components/ui/AppBar";
import { WalletChip } from "@/components/app/WalletChip";
import { WalletProvider } from "@/components/app/WalletProvider";

export const metadata: Metadata = {
  title: "App",
  robots: { index: false },
};

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <WalletProvider>
      <AppBar right={<WalletChip />} />
      <main id="main" className="mx-auto w-full max-w-[480px] px-4 pb-16 pt-8">
        {children}
      </main>
    </WalletProvider>
  );
}
