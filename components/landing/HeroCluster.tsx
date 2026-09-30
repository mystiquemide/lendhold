import { connection } from "next/server";
import { getShareExample } from "@/lib/engine/snapshot";
import { latestShowcasePlan, listConfirmedSteps } from "@/lib/store/db";
import { CodePanel } from "./CodePanel";
import { PhonePanel } from "./PhonePanel";
import { StepsPanel } from "./StepsPanel";

function settled<T>(name: string, result: PromiseSettledResult<T>): T | null {
  if (result.status === "fulfilled") return result.value;
  console.error(`hero cluster: ${name} unavailable`, result.reason);
  return null;
}

export async function HeroCluster() {
  await connection();
  const [example, steps, plan] = await Promise.allSettled([
    getShareExample("NVDA"),
    (async () => listConfirmedSteps(5))(),
    (async () => latestShowcasePlan())(),
  ]);
  const phone = settled("share example", example);
  const rows = settled("confirmed steps", steps);
  const showcase = settled("showcase plan", plan);
  const stepRows = rows && rows.length > 0 ? rows : null;
  if (!phone && !stepRows && !showcase) return null;

  return (
    <div className="cluster-outer mt-16">
      <div className="cluster-frame">
        <div className="cluster-stage flex flex-col items-center gap-8 md:block">
          {phone && <PhonePanel example={phone} />}
          {stepRows && <StepsPanel rows={stepRows} />}
          {showcase && <CodePanel plan={showcase} />}
        </div>
      </div>
    </div>
  );
}
