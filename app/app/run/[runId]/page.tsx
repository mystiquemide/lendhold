import { notFound } from "next/navigation";
import { AppGate } from "@/components/app/AppGate";
import { RunScreen } from "@/components/app/RunScreen";

export default async function RunPage({ params }: PageProps<"/app/run/[runId]">) {
  const { runId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(runId)) notFound();
  return (
    <AppGate>
      <RunScreen runId={runId} />
    </AppGate>
  );
}
