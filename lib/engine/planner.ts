import "server-only";
import { randomUUID } from "node:crypto";
import { formatUnits, getAddress, type Address, type Hex } from "viem";
import { AppError } from "@/lib/errors";
import {
  getAssetStatus,
  getMarketSession,
  getRwaPrices,
  type RwaToken,
} from "@/lib/binance/rwa";
import {
  aprFromRatePerSecond,
  borrowRatePerSecond,
  erc20Allowance,
  erc20Balance,
  erc20Decimals,
  getPosition,
  moolahAddress,
  readMinLoan,
  type MarketParams,
} from "@/lib/lista/chain";
import {
  encodeApprove,
  encodeBorrow,
  encodeRepayAssets,
  encodeRepayShares,
  encodeSupplyCollateral,
  encodeWithdrawCollateral,
} from "@/lib/lista/calldata";
import { borrowSharesToAssets, withRepayHeadroom } from "./debt";
import { pickMarketFor, type MarketChainState } from "./market-select";
import { computeRisk, toUnits, type Health } from "./risk";
import { computeSizing, minLoanFloor, sessionNotices, type Notice, type Sizing } from "./sizing";
import {
  evaluateSwap,
  swapRejectionMessage,
  type SwapEval,
  type SwapToken,
} from "./swap-eval";
import {
  USDT,
  findBStockByTicker,
  findStockToken,
  isStableSymbol,
  parseAmount,
  stockUsdPerToken,
} from "./tokens";
import type { EligibleMarket } from "@/lib/lista/markets";

export type PlanAction = "borrow" | "repay" | "withdraw" | "buy" | "deposit";
export type StepKind =
  | "approve"
  | "supplyCollateral"
  | "borrow"
  | "swap"
  | "repay"
  | "withdrawCollateral";

export interface PlanRequest {
  address: string;
  action: PlanAction;
  /** The stock token: a bStock, or an Ondo token when borrowing (it is converted first). */
  token: string;
  /** Borrow and repay: loan-token units ("all" for repay). Withdraw: stock units ("all"). Buy: USDT units. Deposit: stock units ("all" or omitted: the whole wallet balance). */
  amount?: string;
  /** Borrow: stock units to deposit, default all of the wallet balance. */
  collateralAmount?: string;
  receive?: "USDT" | "loan";
  withdraw?: boolean;
  marketId?: string;
}

export interface SwapSummary {
  quoteId: string;
  vendor: string;
  priceImpact: number;
  expectedOut: bigint;
  valueRatio: number;
}

export interface Step {
  id: string;
  idx: number;
  kind: StepKind;
  label: string;
  to?: Address;
  data?: Hex;
  value?: bigint;
  selector?: Hex;
  token?: Address;
  amount?: bigint;
  swap?: {
    from: Address;
    to: Address;
    fromSymbol: string;
    toSymbol: string;
    amountIn: bigint;
    minOut: bigint;
    fromDecimals: number;
    toDecimals: number;
    /** USD per whole token used for the value check. */
    fromUsd: number;
    toUsd: number;
    quote: SwapSummary;
  };
}

export interface PlanMarket {
  id: Hex;
  params: MarketParams;
  loanSymbol: string;
  loanDecimals: number;
  /** Lista's minimum loan in loan-token units, as read on-chain (before the safety margin). */
  minLoan: bigint;
  /** The smallest total debt Lendhold plans: the minimum loan plus the safety margin. */
  minBorrow: bigint;
}

export interface PlanDisplay {
  sharesBefore: number | null;
  sharesAfter: number | null;
  shareDeltaPct: number | null;
  receive: { symbol: string; amount: bigint; decimals: number } | null;
  debt: { symbol: string; amount: bigint; decimals: number } | null;
  aprPct: number | null;
  riskPricePerShare: number | null;
  cushionPct: number | null;
  health: Health | null;
  conversionCostPct: number | null;
}

export interface Blocker {
  code: string;
  message: string;
}

export interface Plan {
  id: string;
  action: PlanAction;
  address: Address;
  token: Address;
  market: PlanMarket | null;
  display: PlanDisplay;
  sizing: Sizing | null;
  steps: Step[];
  notices: Notice[];
  blockers: Blocker[];
  createdAt: number;
}

const EMPTY_DISPLAY: PlanDisplay = {
  sharesBefore: null,
  sharesAfter: null,
  shareDeltaPct: null,
  receive: null,
  debt: null,
  aprPct: null,
  riskPricePerShare: null,
  cushionPct: null,
  health: null,
  conversionCostPct: null,
};

/** Whole-number-friendly amount for messages: two decimals, rounded up. */
export function fmtUp(amount: bigint, decimals: number): string {
  const unit = 10n ** BigInt(Math.max(decimals - 2, 0));
  const cents = decimals >= 2 ? (amount + unit - 1n) / unit : amount * 10n ** BigInt(2 - decimals);
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

const selectorOf = (data: Hex): Hex => data.slice(0, 10) as Hex;

class Builder {
  readonly id = randomUUID();
  private readonly drafts: Omit<Step, "id" | "idx">[] = [];
  readonly notices: Notice[] = [];
  readonly blockers: Blocker[] = [];

  add(step: Omit<Step, "id" | "idx">) {
    this.drafts.push(step);
  }

  block(code: string, message: string) {
    this.blockers.push({ code, message });
  }

  contract(kind: StepKind, label: string, to: Address, data: Hex, token?: Address, amount?: bigint) {
    this.add({ kind, label, to, data, value: 0n, selector: selectorOf(data), token, amount });
  }

  steps(): Step[] {
    return this.drafts.map((d, idx) => ({ ...d, id: `${this.id}:${idx}`, idx }));
  }
}

function newPlan(b: Builder, req: PlanRequest, owner: Address, token: Address): Plan {
  return {
    id: b.id,
    action: req.action,
    address: owner,
    token,
    market: null,
    display: { ...EMPTY_DISPLAY },
    sizing: null,
    steps: [],
    notices: b.notices,
    blockers: b.blockers,
    createdAt: Date.now(),
  };
}

function finish(plan: Plan, b: Builder): Plan {
  plan.steps = b.blockers.length > 0 ? [] : b.steps();
  return plan;
}

async function stockSwapToken(token: RwaToken): Promise<SwapToken> {
  const price = (await getRwaPrices([token.address])).get(token.address.toLowerCase());
  const usd = stockUsdPerToken(token, price);
  if (usd == null) throw new AppError("NO_PRICE", `No reference price for ${token.symbol}`, 502);
  return { address: token.address as Address, symbol: token.symbol, decimals: token.decimals, usd };
}

async function usdtSwapToken(): Promise<SwapToken> {
  return { address: USDT, symbol: "USDT", decimals: await erc20Decimals(USDT), usd: 1 };
}

function loanSwapToken(market: EligibleMarket, chain: MarketChainState): SwapToken {
  return {
    address: market.params.loanToken,
    symbol: market.loanSymbol,
    decimals: chain.loanDecimals,
    usd: isStableSymbol(market.loanSymbol) ? 1 : Number(chain.loanPrice) / 1e8,
  };
}

function summarize(e: SwapEval): SwapSummary {
  return {
    quoteId: e.quote.quoteId,
    vendor: e.quote.vendor,
    priceImpact: e.quote.priceImpact,
    expectedOut: e.quote.toAmount,
    valueRatio: e.valueRatio,
  };
}

function swapStep(
  b: Builder,
  label: string,
  from: SwapToken,
  to: SwapToken,
  amountIn: bigint,
  e: SwapEval,
) {
  b.add({
    kind: "swap",
    label,
    token: from.address,
    amount: amountIn,
    swap: {
      from: from.address,
      to: to.address,
      fromSymbol: from.symbol,
      toSymbol: to.symbol,
      amountIn,
      minOut: e.minOut,
      fromDecimals: from.decimals,
      toDecimals: to.decimals,
      fromUsd: from.usd,
      toUsd: to.usd,
      quote: summarize(e),
    },
  });
}

/** Quotes a leg, records blockers, and returns the evaluation when usable. */
async function quoteLeg(
  b: Builder,
  from: SwapToken,
  to: SwapToken,
  amountIn: bigint,
  user: string,
): Promise<SwapEval | null> {
  const e = await evaluateSwap(from, to, amountIn, user);
  if (!e) {
    b.block("NO_QUOTE", `No route to swap ${from.symbol} to ${to.symbol} right now`);
    return null;
  }
  if (!e.acceptable) {
    b.block("SWAP_COST_TOO_HIGH", swapRejectionMessage(from.symbol, to.symbol, e));
    return null;
  }
  return e;
}

async function sessionFor(assets: RwaToken[]) {
  const [session, statuses] = await Promise.all([
    getMarketSession(),
    Promise.all(assets.map((a) => getAssetStatus(a.address))),
  ]);
  const notTrading = statuses.find((s) => s.reasonCode !== null && s.reasonCode.toUpperCase() !== "TRADING");
  const primary = statuses[statuses.length - 1];
  const open = (primary?.openState ?? session.openState) === true;
  return {
    statuses,
    session: {
      marketOpen: open,
      assetReasonCode: notTrading?.reasonCode ?? null,
      reasonMsg: notTrading?.reasonMsg ?? null,
      nextOpenTime: primary?.nextOpenTime ?? session.nextOpenTime ?? null,
    },
    allTrading: !notTrading,
  };
}

function takeMarket(
  markets: EligibleMarket[],
  marketId: string | undefined,
): EligibleMarket | undefined {
  return marketId ? markets.find((m) => m.id.toLowerCase() === marketId.toLowerCase()) : undefined;
}

/** Approve (only when the allowance is short) and deposit, shared by borrow and deposit plans. */
async function addDepositSteps(
  b: Builder,
  collateral: RwaToken,
  params: MarketParams,
  amount: bigint,
  owner: Address,
) {
  const moolah = moolahAddress();
  const allowance = await erc20Allowance(collateral.address as Address, owner, moolah);
  if (allowance < amount) {
    b.contract(
      "approve",
      `Allow ${collateral.symbol}`,
      collateral.address as Address,
      encodeApprove(moolah, amount),
      collateral.address as Address,
      amount,
    );
  }
  b.contract(
    "supplyCollateral",
    `Deposit ${collateral.symbol}`,
    moolah,
    encodeSupplyCollateral(params, amount, owner),
    collateral.address as Address,
    amount,
  );
}

// ---------------------------------------------------------------- borrow

async function planBorrow(req: PlanRequest, owner: Address, token: RwaToken): Promise<Plan> {
  const b = new Builder();
  const plan = newPlan(b, req, owner, getAddress(token.address));
  const isOndo = token.platformId === "ondo";

  let collateral: RwaToken = token;
  if (isOndo) {
    const match = await findBStockByTicker(token.ticker);
    if (!match) {
      b.block("NO_CONVERSION", `No bStock to convert ${token.symbol} into`);
      return finish(plan, b);
    }
    collateral = match;
  }

  const pick = await pickMarketFor(collateral, owner);
  const market = pick ? (takeMarket(pick.all, req.marketId) ?? pick.market) : null;
  if (!pick || !market) {
    b.block("NO_MARKET", "No lending market with room right now");
    return finish(plan, b);
  }
  const chain = pick.chainStates.get(market.id)!;
  const params = market.params;
  const loan = loanSwapToken(market, chain);
  const minLoan = await readMinLoan(params);
  plan.market = { id: market.id, params, loanSymbol: market.loanSymbol, loanDecimals: chain.loanDecimals, minLoan, minBorrow: minLoanFloor(minLoan) };

  const { session, statuses, allTrading } = await sessionFor(isOndo ? [token, collateral] : [collateral]);
  if (isOndo && !allTrading) {
    b.block("ASSET_NOT_TRADING", `${token.symbol} cannot be converted right now (${statuses.find((s) => s.reasonCode && s.reasonCode.toUpperCase() !== "TRADING")?.reasonCode})`);
    b.notices.push(...sessionNotices(session));
    return finish(plan, b);
  }

  const walletBalance = await erc20Balance(token.address as Address, owner);
  let depositSource = walletBalance;
  if (req.collateralAmount && req.collateralAmount !== "all") {
    depositSource = parseAmount(req.collateralAmount, token.decimals, "collateralAmount");
    if (depositSource > walletBalance) {
      b.block("INSUFFICIENT_BALANCE", `You hold less ${token.symbol} than requested`);
      return finish(plan, b);
    }
  }

  const position = await getPosition(market.id, owner);
  const rate = await borrowRatePerSecond(params, chain.state);
  const existingDebt = borrowSharesToAssets(position.borrowShares, chain.state, {
    ratePerSecond: rate,
    nowSec: BigInt(Math.floor(Date.now() / 1000)),
  });

  let newCollateral = depositSource;
  const sharesBefore = toUnits(depositSource, token.decimals) * token.ratio;
  let sharesAfter = sharesBefore;
  let conversionCostPct: number | null = null;

  if (isOndo) {
    if (depositSource === 0n) {
      b.block("INSUFFICIENT_BALANCE", `You hold no ${token.symbol}`);
      return finish(plan, b);
    }
    const [onToken, usdt, bToken] = await Promise.all([
      stockSwapToken(token),
      usdtSwapToken(),
      stockSwapToken(collateral),
    ]);
    const leg1 = await quoteLeg(b, onToken, usdt, depositSource, owner);
    if (!leg1) return finish(plan, b);
    const usdtIn = leg1.minOut;
    const leg2 = await quoteLeg(b, usdt, bToken, usdtIn, owner);
    if (!leg2) return finish(plan, b);
    swapStep(b, `Sell ${token.symbol} for USDT`, onToken, usdt, depositSource, leg1);
    swapStep(b, `Buy ${collateral.symbol}`, usdt, bToken, usdtIn, leg2);
    newCollateral = leg2.minOut;
    sharesAfter = toUnits(leg2.quote.toAmount, collateral.decimals) * collateral.ratio;
    conversionCostPct = sharesBefore > 0 ? (1 - sharesAfter / sharesBefore) * 100 : null;
  }

  if (newCollateral === 0n && position.collateral === 0n) {
    b.block("NO_COLLATERAL", `You have no ${collateral.symbol} to borrow against`);
    return finish(plan, b);
  }

  const totalCollateral = position.collateral + newCollateral;
  const sizing = computeSizing({
    collateralRaw: totalCollateral,
    collateralDecimals: collateral.decimals,
    collateralPrice: chain.collateralPrice,
    loanPrice: chain.loanPrice,
    loanDecimals: chain.loanDecimals,
    lltv: params.lltv,
    existingDebt,
    availableLiquidity: chain.availableLoan,
    session,
  });
  plan.sizing = sizing;
  b.notices.push(...sizing.notices);

  let borrowAmount: bigint;
  if (req.amount) {
    borrowAmount = parseAmount(req.amount, chain.loanDecimals);
    if (borrowAmount > sizing.maxBorrowNew) {
      b.block(
        "ABOVE_MAX",
        `That is more than the ${formatUnits(sizing.maxBorrowNew, chain.loanDecimals)} ${market.loanSymbol} you can borrow here`,
      );
      return finish(plan, b);
    }
    if (borrowAmount > sizing.safeBorrowNew) {
      b.notices.push({
        code: "ABOVE_SAFE",
        message: `Above the safe amount of ${formatUnits(sizing.safeBorrowNew, chain.loanDecimals)} ${market.loanSymbol}: less room before liquidation`,
      });
    }
  } else {
    borrowAmount = sizing.safeBorrowNew;
    if (borrowAmount === 0n) {
      b.block("NOTHING_TO_BORROW", "Nothing can be borrowed safely right now");
      return finish(plan, b);
    }
  }

  const floor = minLoanFloor(minLoan);
  if (existingDebt + borrowAmount < floor) {
    const sym = market.loanSymbol;
    b.block(
      "BELOW_MIN_LOAN",
      req.amount
        ? existingDebt > 0n
          ? `Lista's minimum loan is ${fmtUp(floor, chain.loanDecimals)} ${sym}. Your total debt must stay at or above that`
          : `Lista's minimum loan is ${fmtUp(floor, chain.loanDecimals)} ${sym}. Borrow at least that much`
        : `The safe amount is ${fmtUp(sizing.safeBorrowNew, chain.loanDecimals)} ${sym}, below Lista's minimum loan of ${fmtUp(floor, chain.loanDecimals)} ${sym}. Deposit more ${collateral.symbol} to borrow`,
    );
    return finish(plan, b);
  }

  const moolah = moolahAddress();
  if (newCollateral > 0n) {
    await addDepositSteps(b, collateral, params, newCollateral, owner);
  }
  b.contract(
    "borrow",
    `Borrow ${market.loanSymbol}`,
    moolah,
    encodeBorrow(params, borrowAmount, owner, owner),
    params.loanToken,
    borrowAmount,
  );

  let receive = { symbol: market.loanSymbol, amount: borrowAmount, decimals: chain.loanDecimals };
  const wantUsdt = (req.receive ?? "USDT") === "USDT";
  if (wantUsdt && params.loanToken.toLowerCase() !== USDT.toLowerCase()) {
    const usdt = await usdtSwapToken();
    const e = await quoteLeg(b, loan, usdt, borrowAmount, owner);
    if (!e) return finish(plan, b);
    swapStep(b, `Swap ${market.loanSymbol} to USDT`, loan, usdt, borrowAmount, e);
    receive = { symbol: "USDT", amount: e.quote.toAmount, decimals: usdt.decimals };
  }

  const debtAfter = existingDebt + borrowAmount;
  const risk = computeRisk({
    collateralRaw: totalCollateral,
    collateralDecimals: collateral.decimals,
    ratio: collateral.ratio,
    debtRaw: debtAfter,
    loanDecimals: chain.loanDecimals,
    collateralPrice: chain.collateralPrice,
    loanPrice: chain.loanPrice,
    lltv: params.lltv,
  });
  plan.display = {
    sharesBefore,
    sharesAfter,
    shareDeltaPct: sharesBefore > 0 ? (sharesAfter / sharesBefore - 1) * 100 : null,
    receive,
    debt: { symbol: market.loanSymbol, amount: debtAfter, decimals: chain.loanDecimals },
    aprPct: aprFromRatePerSecond(rate) * 100,
    riskPricePerShare: risk.liquidationPricePerShare,
    cushionPct: risk.cushion == null ? null : risk.cushion * 100,
    health: risk.health,
    conversionCostPct,
  };
  return finish(plan, b);
}

// ---------------------------------------------------------------- repay / withdraw

async function findPositionMarket(
  collateral: RwaToken,
  owner: Address,
  marketId: string | undefined,
  need: "debt" | "collateral",
) {
  const pick = await pickMarketFor(collateral, owner);
  if (!pick) return null;
  const candidates = takeMarket(pick.all, marketId) ? [takeMarket(pick.all, marketId)!] : pick.all;
  for (const market of candidates) {
    const position = await getPosition(market.id, owner);
    const has = need === "debt" ? position.borrowShares > 0n : position.collateral > 0n;
    if (has) return { market, position, chain: pick.chainStates.get(market.id)! };
  }
  return null;
}

async function planRepay(req: PlanRequest, owner: Address, token: RwaToken): Promise<Plan> {
  const b = new Builder();
  const plan = newPlan(b, req, owner, getAddress(token.address));
  if (token.platformId !== "bstock") {
    b.block("NOT_BSTOCK", "Repay against the bStock you deposited");
    return finish(plan, b);
  }
  const found = await findPositionMarket(token, owner, req.marketId, "debt");
  if (!found) {
    b.block("NO_DEBT", `You have no ${token.symbol} loan to repay`);
    return finish(plan, b);
  }
  const { market, position, chain } = found;
  const params = market.params;
  const minLoan = await readMinLoan(params);
  plan.market = { id: market.id, params, loanSymbol: market.loanSymbol, loanDecimals: chain.loanDecimals, minLoan, minBorrow: minLoanFloor(minLoan) };
  const rate = await borrowRatePerSecond(params, chain.state);
  const debt = borrowSharesToAssets(position.borrowShares, chain.state, {
    ratePerSecond: rate,
    nowSec: BigInt(Math.floor(Date.now() / 1000)),
  });
  const moolah = moolahAddress();
  const all = !req.amount || req.amount === "all";
  const repayAssets = all ? undefined : parseAmount(req.amount!, chain.loanDecimals);
  if (repayAssets !== undefined && repayAssets > debt) {
    b.block("ABOVE_DEBT", `That is more than you owe (${formatUnits(debt, chain.loanDecimals)} ${market.loanSymbol}). Choose repay all.`);
    return finish(plan, b);
  }
  if (repayAssets !== undefined) {
    const remainingDebt = debt - repayAssets;
    const floor = minLoanFloor(minLoan);
    if (remainingDebt > 0n && remainingDebt < floor) {
      const sym = market.loanSymbol;
      b.block(
        "PARTIAL_REPAY_BELOW_MIN",
        `That leaves ${fmtUp(remainingDebt, chain.loanDecimals)} ${sym} owed, below Lista's minimum loan of ${fmtUp(floor, chain.loanDecimals)} ${sym}. Repay all, or leave at least ${fmtUp(floor, chain.loanDecimals)} ${sym} owed`,
      );
      return finish(plan, b);
    }
  }
  const needed = all ? withRepayHeadroom(debt) : repayAssets!;
  const balance = await erc20Balance(params.loanToken, owner);
  if (balance < (all ? debt : needed)) {
    b.block("INSUFFICIENT_LOAN_BALANCE", `You need ${formatUnits(all ? debt : needed, chain.loanDecimals)} ${market.loanSymbol} in your wallet to repay`);
    return finish(plan, b);
  }
  const allowance = await erc20Allowance(params.loanToken, owner, moolah);
  if (allowance < needed) {
    b.contract("approve", `Allow ${market.loanSymbol}`, params.loanToken, encodeApprove(moolah, needed), params.loanToken, needed);
  }
  b.contract(
    "repay",
    all ? `Repay all ${market.loanSymbol}` : `Repay ${market.loanSymbol}`,
    moolah,
    all ? encodeRepayShares(params, position.borrowShares, owner) : encodeRepayAssets(params, repayAssets!, owner),
    params.loanToken,
    all ? debt : repayAssets!,
  );
  const remaining = all ? 0n : debt - repayAssets!;
  if (req.withdraw && all) {
    b.contract(
      "withdrawCollateral",
      `Withdraw ${token.symbol}`,
      moolah,
      encodeWithdrawCollateral(params, position.collateral, owner, owner),
      token.address as Address,
      position.collateral,
    );
  } else if (req.withdraw) {
    b.block("WITHDRAW_NEEDS_FULL_REPAY", "Repay everything to withdraw your collateral");
  }
  const shares = toUnits(position.collateral, token.decimals) * token.ratio;
  const risk = computeRisk({
    collateralRaw: position.collateral,
    collateralDecimals: token.decimals,
    ratio: token.ratio,
    debtRaw: remaining,
    loanDecimals: chain.loanDecimals,
    collateralPrice: chain.collateralPrice,
    loanPrice: chain.loanPrice,
    lltv: params.lltv,
  });
  plan.display = {
    ...EMPTY_DISPLAY,
    sharesBefore: shares,
    sharesAfter: shares,
    shareDeltaPct: 0,
    debt: { symbol: market.loanSymbol, amount: remaining, decimals: chain.loanDecimals },
    aprPct: aprFromRatePerSecond(rate) * 100,
    riskPricePerShare: risk.liquidationPricePerShare,
    cushionPct: risk.cushion == null ? null : risk.cushion * 100,
    health: risk.health,
  };
  return finish(plan, b);
}

async function planWithdraw(req: PlanRequest, owner: Address, token: RwaToken): Promise<Plan> {
  const b = new Builder();
  const plan = newPlan(b, req, owner, getAddress(token.address));
  if (token.platformId !== "bstock") {
    b.block("NOT_BSTOCK", "Withdraw the bStock you deposited");
    return finish(plan, b);
  }
  const found = await findPositionMarket(token, owner, req.marketId, "collateral");
  if (!found) {
    b.block("NO_COLLATERAL", `You have no ${token.symbol} deposited`);
    return finish(plan, b);
  }
  const { market, position, chain } = found;
  const params = market.params;
  const minLoan = await readMinLoan(params);
  plan.market = { id: market.id, params, loanSymbol: market.loanSymbol, loanDecimals: chain.loanDecimals, minLoan, minBorrow: minLoanFloor(minLoan) };
  const rate = await borrowRatePerSecond(params, chain.state);
  const debt = borrowSharesToAssets(position.borrowShares, chain.state, {
    ratePerSecond: rate,
    nowSec: BigInt(Math.floor(Date.now() / 1000)),
  });
  const all = !req.amount || req.amount === "all";
  const amount = all ? position.collateral : parseAmount(req.amount!, token.decimals);
  if (amount > position.collateral) {
    b.block("ABOVE_DEPOSITED", `You only have ${formatUnits(position.collateral, token.decimals)} ${token.symbol} deposited`);
    return finish(plan, b);
  }
  const remainingCollateral = position.collateral - amount;
  const { session } = await sessionFor([token]);
  const sizing = computeSizing({
    collateralRaw: remainingCollateral,
    collateralDecimals: token.decimals,
    collateralPrice: chain.collateralPrice,
    loanPrice: chain.loanPrice,
    loanDecimals: chain.loanDecimals,
    lltv: params.lltv,
    existingDebt: debt,
    availableLiquidity: chain.availableLoan,
    session,
  });
  plan.sizing = sizing;
  b.notices.push(...sizing.notices);
  if (debt > 0n && debt > sizing.maxBorrowTotal) {
    b.block("WOULD_LIQUIDATE", "Withdrawing that much would leave your loan under-collateralized. Repay some first.");
    return finish(plan, b);
  }
  if (debt > 0n && sizing.safeBorrowNew === 0n) {
    b.notices.push({ code: "ABOVE_SAFE", message: "After this, your loan has little room before liquidation" });
  }
  b.contract(
    "withdrawCollateral",
    `Withdraw ${token.symbol}`,
    moolahAddress(),
    encodeWithdrawCollateral(params, amount, owner, owner),
    token.address as Address,
    amount,
  );
  const risk = computeRisk({
    collateralRaw: remainingCollateral,
    collateralDecimals: token.decimals,
    ratio: token.ratio,
    debtRaw: debt,
    loanDecimals: chain.loanDecimals,
    collateralPrice: chain.collateralPrice,
    loanPrice: chain.loanPrice,
    lltv: params.lltv,
  });
  plan.display = {
    ...EMPTY_DISPLAY,
    sharesBefore: toUnits(position.collateral, token.decimals) * token.ratio,
    sharesAfter: toUnits(remainingCollateral, token.decimals) * token.ratio,
    debt: { symbol: market.loanSymbol, amount: debt, decimals: chain.loanDecimals },
    aprPct: aprFromRatePerSecond(rate) * 100,
    riskPricePerShare: risk.liquidationPricePerShare,
    cushionPct: risk.cushion == null ? null : risk.cushion * 100,
    health: risk.health,
  };
  return finish(plan, b);
}

// ---------------------------------------------------------------- deposit

async function planDeposit(req: PlanRequest, owner: Address, token: RwaToken): Promise<Plan> {
  const b = new Builder();
  const plan = newPlan(b, req, owner, getAddress(token.address));
  if (token.platformId !== "bstock") {
    b.block("NOT_BSTOCK", "Deposit a bStock. Convert Ondo tokens by borrowing against them");
    return finish(plan, b);
  }

  const existing = await findPositionMarket(token, owner, req.marketId, "collateral");
  let market: EligibleMarket;
  let chain: MarketChainState;
  let position: { collateral: bigint; borrowShares: bigint };
  if (existing) {
    ({ market, chain, position } = existing);
  } else {
    const pick = await pickMarketFor(token, owner);
    const chosen = pick ? (takeMarket(pick.all, req.marketId) ?? pick.market) : null;
    if (!pick || !chosen) {
      b.block("NO_MARKET", "No lending market with room right now");
      return finish(plan, b);
    }
    market = chosen;
    chain = pick.chainStates.get(chosen.id)!;
    position = await getPosition(chosen.id, owner);
  }
  const params = market.params;
  const minLoan = await readMinLoan(params);
  plan.market = { id: market.id, params, loanSymbol: market.loanSymbol, loanDecimals: chain.loanDecimals, minLoan, minBorrow: minLoanFloor(minLoan) };

  const balance = await erc20Balance(token.address as Address, owner);
  const all = !req.amount || req.amount === "all";
  if (!all && /^0+(\.0+)?$/.test(req.amount!.trim())) {
    b.block("INSUFFICIENT_BALANCE", `Enter an amount of ${token.symbol} above zero`);
    return finish(plan, b);
  }
  const amount = all ? balance : parseAmount(req.amount!, token.decimals);
  if (balance === 0n) {
    b.block("INSUFFICIENT_BALANCE", `You hold no ${token.symbol}`);
    return finish(plan, b);
  }
  if (amount > balance) {
    b.block("INSUFFICIENT_BALANCE", `You hold less ${token.symbol} than requested`);
    return finish(plan, b);
  }

  const rate = await borrowRatePerSecond(params, chain.state);
  const debt = borrowSharesToAssets(position.borrowShares, chain.state, {
    ratePerSecond: rate,
    nowSec: BigInt(Math.floor(Date.now() / 1000)),
  });
  const totalCollateral = position.collateral + amount;
  const { session } = await sessionFor([token]);
  const sizing = computeSizing({
    collateralRaw: totalCollateral,
    collateralDecimals: token.decimals,
    collateralPrice: chain.collateralPrice,
    loanPrice: chain.loanPrice,
    loanDecimals: chain.loanDecimals,
    lltv: params.lltv,
    existingDebt: debt,
    availableLiquidity: chain.availableLoan,
    session,
  });
  plan.sizing = sizing;
  b.notices.push(...sizing.notices);

  await addDepositSteps(b, token, params, amount, owner);

  const risk = computeRisk({
    collateralRaw: totalCollateral,
    collateralDecimals: token.decimals,
    ratio: token.ratio,
    debtRaw: debt,
    loanDecimals: chain.loanDecimals,
    collateralPrice: chain.collateralPrice,
    loanPrice: chain.loanPrice,
    lltv: params.lltv,
  });
  plan.display = {
    ...EMPTY_DISPLAY,
    sharesBefore: toUnits(position.collateral, token.decimals) * token.ratio,
    sharesAfter: toUnits(totalCollateral, token.decimals) * token.ratio,
    debt: debt > 0n ? { symbol: market.loanSymbol, amount: debt, decimals: chain.loanDecimals } : null,
    aprPct: aprFromRatePerSecond(rate) * 100,
    riskPricePerShare: risk.liquidationPricePerShare,
    cushionPct: risk.cushion == null ? null : risk.cushion * 100,
    health: risk.health,
  };
  return finish(plan, b);
}

// ---------------------------------------------------------------- buy

async function planBuy(req: PlanRequest, owner: Address, token: RwaToken): Promise<Plan> {
  const b = new Builder();
  const plan = newPlan(b, req, owner, getAddress(token.address));
  if (token.platformId !== "bstock") {
    b.block("NOT_BSTOCK", "Buying is for bStocks");
    return finish(plan, b);
  }
  if (!req.amount) {
    b.block("AMOUNT_REQUIRED", "Enter how much USDT to spend");
    return finish(plan, b);
  }
  const usdt = await usdtSwapToken();
  const amountIn = parseAmount(req.amount, usdt.decimals);
  const { session, statuses, allTrading } = await sessionFor([token]);
  b.notices.push(...sessionNotices(session));
  if (!allTrading) {
    b.block("ASSET_NOT_TRADING", `${token.symbol} cannot be bought right now (${statuses[0]?.reasonCode})`);
    return finish(plan, b);
  }
  const bToken = await stockSwapToken(token);
  const e = await quoteLeg(b, usdt, bToken, amountIn, owner);
  if (!e) return finish(plan, b);
  swapStep(b, `Buy ${token.symbol}`, usdt, bToken, amountIn, e);
  const shares = toUnits(e.quote.toAmount, token.decimals) * token.ratio;
  plan.display = {
    ...EMPTY_DISPLAY,
    sharesBefore: 0,
    sharesAfter: shares,
    receive: { symbol: token.symbol, amount: e.quote.toAmount, decimals: token.decimals },
    conversionCostPct: e.costPct,
  };
  return finish(plan, b);
}

export async function buildPlan(req: PlanRequest): Promise<Plan> {
  const owner = getAddress(req.address);
  const token = await findStockToken(req.token);
  if (!token) throw new AppError("UNKNOWN_TOKEN", "That token is not a supported stock token", 404);
  switch (req.action) {
    case "borrow":
      return planBorrow(req, owner, token);
    case "repay":
      return planRepay(req, owner, token);
    case "withdraw":
      return planWithdraw(req, owner, token);
    case "buy":
      return planBuy(req, owner, token);
    case "deposit":
      return planDeposit(req, owner, token);
  }
}


