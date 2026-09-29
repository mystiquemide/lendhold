import "server-only";
import { getAddress, type Address, type Hex } from "viem";
import { getChain } from "@/lib/chain";
import { getConfig } from "@/lib/config";
import { erc20Abi, irmAbi, moolahAbi, oracleAbi } from "./abi";

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
export const DEAD_ADDRESS: Address = "0x000000000000000000000000000000000000dEaD";

export interface MarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

export interface MarketState {
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
}

export interface Position {
  supplyShares: bigint;
  borrowShares: bigint;
  collateral: bigint;
}

export function moolahAddress(): Address {
  return getAddress(getConfig().LISTA_MOOLAH_ADDRESS);
}

const toParams = (p: {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}): MarketParams => ({
  loanToken: getAddress(p.loanToken),
  collateralToken: getAddress(p.collateralToken),
  oracle: getAddress(p.oracle),
  irm: getAddress(p.irm),
  lltv: p.lltv,
});

export async function getMarketParams(id: Hex): Promise<MarketParams> {
  return toParams(
    await getChain().readContract({
      address: moolahAddress(),
      abi: moolahAbi,
      functionName: "idToMarketParams",
      args: [id],
    }),
  );
}

export async function getMarketState(id: Hex): Promise<MarketState> {
  const [totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee] =
    await getChain().readContract({
      address: moolahAddress(),
      abi: moolahAbi,
      functionName: "market",
      args: [id],
    });
  return { totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee };
}

export async function getPosition(id: Hex, user: Address): Promise<Position> {
  const [supplyShares, borrowShares, collateral] = await getChain().readContract({
    address: moolahAddress(),
    abi: moolahAbi,
    functionName: "position",
    args: [id, user],
  });
  return { supplyShares, borrowShares, collateral };
}

export async function isWhiteListed(id: Hex, account: Address): Promise<boolean> {
  return getChain().readContract({
    address: moolahAddress(),
    abi: moolahAbi,
    functionName: "isWhiteList",
    args: [id, account],
  });
}

export async function getProvider(id: Hex, token: Address): Promise<Address> {
  return getAddress(
    await getChain().readContract({
      address: moolahAddress(),
      abi: moolahAbi,
      functionName: "providers",
      args: [id, token],
    }),
  );
}

export async function getBroker(id: Hex): Promise<Address> {
  return getAddress(
    await getChain().readContract({
      address: moolahAddress(),
      abi: moolahAbi,
      functionName: "brokers",
      args: [id],
    }),
  );
}

export interface MarketGate {
  params: MarketParams;
  provider: Address;
  broker: Address;
  whitelisted: boolean;
}

/** One multicall reading everything eligibility needs for a market. */
export async function readMarketGate(
  id: Hex,
  collateral: Address,
  user: Address,
): Promise<MarketGate> {
  const address = moolahAddress();
  const [params, provider, broker, whitelisted] = await getChain().multicall({
    allowFailure: false,
    contracts: [
      { address, abi: moolahAbi, functionName: "idToMarketParams", args: [id] },
      { address, abi: moolahAbi, functionName: "providers", args: [id, collateral] },
      { address, abi: moolahAbi, functionName: "brokers", args: [id] },
      { address, abi: moolahAbi, functionName: "isWhiteList", args: [id, user] },
    ],
  });
  return {
    params: toParams(params),
    provider: getAddress(provider),
    broker: getAddress(broker),
    whitelisted,
  };
}

/** USD price with 8 decimals from the market oracle. `price()` reverts on this oracle, `peek(token)` works. */
export async function peekPrice(oracle: Address, token: Address): Promise<bigint> {
  return getChain().readContract({
    address: oracle,
    abi: oracleAbi,
    functionName: "peek",
    args: [token],
  });
}

export const ORACLE_DECIMALS = 8;

/** Per-second borrow rate, scaled by 1e18, from the IRM's `borrowRateView`. */
export async function borrowRatePerSecond(
  params: MarketParams,
  market: MarketState,
): Promise<bigint> {
  return getChain().readContract({
    address: params.irm,
    abi: irmAbi,
    functionName: "borrowRateView",
    args: [params, market],
  });
}

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

/** Simple (non-compounded) annual rate as a fraction: 0.05 = 5%. */
export function aprFromRatePerSecond(ratePerSecond: bigint): number {
  return (Number(ratePerSecond) / 1e18) * SECONDS_PER_YEAR;
}

export async function erc20Balance(token: Address, owner: Address): Promise<bigint> {
  return getChain().readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

export async function erc20Allowance(
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return getChain().readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

export async function erc20Decimals(token: Address): Promise<number> {
  return getChain().readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  });
}
