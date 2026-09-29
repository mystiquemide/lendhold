import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { getHoldings } from "@/lib/engine/holdings";
import { buildPlan } from "@/lib/engine/planner";
import { prepareForReview } from "@/lib/engine/checks";
import { NVDAB } from "../helpers";
import { findNvdabHolder } from "./holder";

const HOLDER = "0x86d5879c84F81257e197B60E08A8dbb173d931D2";

describe("live engine", () => {
  it("shows the NVDAB holding as ready to borrow against", async () => {
    const holdings = await getHoldings(HOLDER);
    console.log("holdings:", holdings.map((h) => `${h.symbol} ${h.platform} ${h.status} shares=${h.shares} usd=${h.valueUsd}`));
    const nvdab = holdings.find((h) => h.address === getAddress(NVDAB));
    expect(nvdab, "NVDAB holding").toBeDefined();
    expect(nvdab).toMatchObject({ platform: "bstock", decimals: 18, status: "ready" });
    expect(nvdab!.amount).toBeGreaterThan(0n);
  });

  it("builds a $1 borrow plan and simulates step 0", async () => {
    // HOLDER only has dust (about 36 wei of NVDAB), so the plan uses a holder with a meaningful balance.
    const holder = await findNvdabHolder();
    console.log("plan holder:", holder);
    const plan = await buildPlan({ address: holder, action: "borrow", token: NVDAB, amount: "1" });
    console.log("plan blockers:", plan.blockers, "notices:", plan.notices.map((n) => n.code));
    console.log("steps:", plan.steps.map((s) => `${s.idx}:${s.kind}:${s.label}`));
    console.log("display:", JSON.stringify(plan.display, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    expect(plan.blockers, JSON.stringify(plan.blockers)).toEqual([]);
    expect(plan.market).not.toBeNull();
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    const review = await prepareForReview(plan);
    console.log("review:", JSON.stringify(review));
    expect(["approve", "supplyCollateral"]).toContain(plan.steps[0].kind);
    expect(review.steps[0], JSON.stringify(review)).toMatchObject({ status: "simulated_ok" });
  });
});
