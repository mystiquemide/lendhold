import { notFound } from "next/navigation";
import { AppGate } from "@/components/app/AppGate";
import { ReviewScreen } from "@/components/app/ReviewScreen";

export default async function ReviewPage({ params, searchParams }: PageProps<"/app/review/[planId]">) {
  const { planId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(planId)) notFound();
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  return (
    <AppGate>
      <ReviewScreen planId={planId} amount={one(q.amount)} receive={one(q.receive)} />
    </AppGate>
  );
}
