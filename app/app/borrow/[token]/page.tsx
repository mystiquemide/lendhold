import { notFound } from "next/navigation";
import { AppGate } from "@/components/app/AppGate";
import { BorrowScreen } from "@/components/app/BorrowScreen";

export default async function BorrowPage({ params }: PageProps<"/app/borrow/[token]">) {
  const { token } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(token)) notFound();
  return (
    <AppGate>
      <BorrowScreen token={token} />
    </AppGate>
  );
}
