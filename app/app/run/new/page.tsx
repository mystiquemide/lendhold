import { notFound } from "next/navigation";
import { AppGate } from "@/components/app/AppGate";
import { RunStart } from "@/components/app/RunStart";

export default async function NewRunPage({ searchParams }: PageProps<"/app/run/new">) {
  const { plan } = await searchParams;
  if (typeof plan !== "string" || !/^[0-9a-f-]{36}$/i.test(plan)) notFound();
  return (
    <AppGate>
      <RunStart planId={plan} />
    </AppGate>
  );
}
