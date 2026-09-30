import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { getHoldings } from "@/lib/engine/holdings";
import { buildPlan } from "@/lib/engine/planner";
import { prepareForReview } from "@/lib/engine/checks";
import { getMarketParams, readMinLoan } from "@/lib/lista/chain";
import { NVDAB, NVDAB_MARKET } from "../helpers";
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

  it("builds a borrow plan above the minimum loan and simulates step 0", async () => {
    // HOLDER only has dust (about 36 wei of NVDAB), so the plan uses a holder with a meaningful balance.
    const holder = await findNvdabHolder(2n * 10n ** 17n);
    console.log("plan holder:", holder);
    const plan = await buildPlan({ address: holder, action: "borrow", token: NVDAB, amount: "16" });
    console.log("plan blockers:", plan.blockers, "notices:", plan.notices.map((n) => n.code));
    console.log("steps:", plan.steps.map((s) => `${s.idx}:${s.kind}:${s.label}`));
    console.log("display:", JSON.stringify(plan.display, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    expect(plan.blockers, JSON.stringify(plan.blockers)).toEqual([]);
    expect(plan.market).not.toBeNull();
    expect(plan.market!.minLoan).toBeGreaterThan(0n);
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    const review = await prepareForReview(plan);
    console.log("review:", JSON.stringify(review));
    expect(["approve", "supplyCollateral"]).toContain(plan.steps[0].kind);
    expect(review.steps[0], JSON.stringify(review)).toMatchObject({ status: "simulated_ok" });
  });

  it("reads Lista's minimum loan and blocks a $1 borrow with it", async () => {
    const params = await getMarketParams(NVDAB_MARKET as `0x${string}`);
    const minLoan = await readMinLoan(params);
    console.log("minLoan NVDAB/USD1:", minLoan);
    expect(minLoan).toBeGreaterThan(10n * 10n ** 18n);
    expect(minLoan).toBeLessThan(20n * 10n ** 18n);

    const holder = await findNvdabHolder();
    const small = await buildPlan({ address: holder, action: "borrow", token: NVDAB, amount: "1", marketId: NVDAB_MARKET });
    console.log("$1 borrow:", JSON.stringify(small.blockers));
    expect(small.blockers.map((b) => b.code)).toEqual(["BELOW_MIN_LOAN"]);
    expect(small.steps).toEqual([]);
    expect(small.market!.minLoan).toBe(minLoan);
  });

  it("builds a read-only deposit plan for a holder and simulates step 0", async () => {
    const holder = await findNvdabHolder();
    const plan = await buildPlan({ address: holder, action: "deposit", token: NVDAB, amount: "0.001" });
    console.log("deposit steps:", plan.steps.map((s) => `${s.idx}:${s.kind}:${s.label}`), "blockers:", JSON.stringify(plan.blockers));
    console.log("deposit display:", JSON.stringify(plan.display, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    expect(plan.blockers, JSON.stringify(plan.blockers)).toEqual([]);
    expect(plan.steps[plan.steps.length - 1].kind).toBe("supplyCollateral");
    const review = await prepareForReview(plan);
    console.log("deposit review:", JSON.stringify({ ok: review.ok, steps: review.steps.map((x) => x.status), problems: review.problems }));
    expect(["approve", "supplyCollateral"]).toContain(plan.steps[0].kind);
    expect(review.steps[0], JSON.stringify(review)).toMatchObject({ status: "simulated_ok" });
  });
});
