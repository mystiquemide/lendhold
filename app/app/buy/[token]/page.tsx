import { notFound } from "next/navigation";
import { AppGate } from "@/components/app/AppGate";
import { BuyScreen } from "@/components/app/BuyScreen";

export default async function BuyPage({ params }: PageProps<"/app/buy/[token]">) {
  const { token } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(token)) notFound();
  return (
    <AppGate>
      <BuyScreen token={token} />
    </AppGate>
  );
}
