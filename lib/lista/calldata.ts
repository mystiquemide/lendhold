import { encodeFunctionData, toFunctionSelector, type Address, type Hex } from "viem";
import { erc20Abi, moolahAbi } from "./abi";

export interface MarketParamsInput {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

const EMPTY: Hex = "0x";

export function encodeApprove(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] });
}

export function encodeSupplyCollateral(
  params: MarketParamsInput,
  assets: bigint,
  onBehalf: Address,
): Hex {
  return encodeFunctionData({
    abi: moolahAbi,
    functionName: "supplyCollateral",
    args: [params, assets, onBehalf, EMPTY],
  });
}

export function encodeBorrow(
  params: MarketParamsInput,
  assets: bigint,
  onBehalf: Address,
  receiver: Address,
): Hex {
  return encodeFunctionData({
    abi: moolahAbi,
    functionName: "borrow",
    args: [params, assets, 0n, onBehalf, receiver],
  });
}

export function encodeRepayAssets(
  params: MarketParamsInput,
  assets: bigint,
  onBehalf: Address,
): Hex {
  return encodeFunctionData({
    abi: moolahAbi,
    functionName: "repay",
    args: [params, assets, 0n, onBehalf, EMPTY],
  });
}

/** Repays exact borrow shares (use the full position shares to close the debt). */
export function encodeRepayShares(
  params: MarketParamsInput,
  shares: bigint,
  onBehalf: Address,
): Hex {
  return encodeFunctionData({
    abi: moolahAbi,
    functionName: "repay",
    args: [params, 0n, shares, onBehalf, EMPTY],
  });
}

export function encodeWithdrawCollateral(
  params: MarketParamsInput,
  assets: bigint,
  onBehalf: Address,
  receiver: Address,
): Hex {
  return encodeFunctionData({
    abi: moolahAbi,
    functionName: "withdrawCollateral",
    args: [params, assets, onBehalf, receiver],
  });
}

const sig = (signature: string): Hex => toFunctionSelector(signature);

const PARAMS = "(address,address,address,address,uint256)";

export const SELECTORS = {
  approve: sig("approve(address,uint256)"),
  supplyCollateral: sig(`supplyCollateral(${PARAMS},uint256,address,bytes)`),
  borrow: sig(`borrow(${PARAMS},uint256,uint256,address,address)`),
  repay: sig(`repay(${PARAMS},uint256,uint256,address,bytes)`),
  withdrawCollateral: sig(`withdrawCollateral(${PARAMS},uint256,address,address)`),
} as const;
