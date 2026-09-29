import "server-only";
import { z } from "zod";
import { getBinance } from "./client";
import { callApi } from "./unwrap";
import { numeric } from "@/lib/schema";

const BSC = "56";

/** The SDK insists on solTx and tronTx, but the gateway rejects them when present for an EVM chain. */
const OMIT_FIELD = { toJSON: () => undefined };

const simulationSchema = z.looseObject({
  status: z.string(),
  failReason: z.string().nullable().optional(),
});

export interface SimulationInput {
  from: string;
  to: string;
  data: string;
  value?: bigint;
}

export interface Simulation {
  ok: boolean;
  revertReason?: string;
  raw: unknown;
}

export async function simulate(input: SimulationInput): Promise<Simulation> {
  const data = await callApi(
    "simulateTransactions",
    getBinance().simulateTransactions({
      binanceChainId: BSC,
      evmTx: {
        from: input.from,
        to: input.to,
        value: (input.value ?? 0n).toString(),
        data: input.data,
      },
      solTx: OMIT_FIELD,
      tronTx: OMIT_FIELD,
    } as unknown as Parameters<ReturnType<typeof getBinance>["simulateTransactions"]>[0]),
    simulationSchema,
  );
  const ok = data.status === "SUCCESS";
  return {
    ok,
    ...(ok ? {} : { revertReason: data.failReason || data.status }),
    raw: data,
  };
}

const gasPriceSchema = z.looseObject({
  evmLegacyGasPrice: z
    .object({ mediumGasPrice: numeric })
    .nullable()
    .optional(),
});

/** Medium legacy gas price in wei. */
export async function getGasPrice(): Promise<bigint> {
  const data = await callApi(
    "getGasPrice",
    getBinance().getGasPrice({ binanceChainId: BSC }),
    gasPriceSchema,
  );
  const medium = data.evmLegacyGasPrice?.mediumGasPrice;
  if (medium == null) throw new Error("getGasPrice: no legacy gas price for chain 56");
  return BigInt(Math.round(medium));
}

