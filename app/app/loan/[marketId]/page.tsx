import { notFound } from "next/navigation";
import { AppGate } from "@/components/app/AppGate";
import { LoanScreen } from "@/components/app/LoanScreen";

export default async function LoanPage({ params }: PageProps<"/app/loan/[marketId]">) {
  const { marketId } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(marketId)) notFound();
  return (
    <AppGate>
      <LoanScreen marketId={marketId} />
    </AppGate>
  );
}
