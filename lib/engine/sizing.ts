export const BUFFER_OPEN = 6000n;
export const BUFFER_CLOSED = 4500n;
export const MIN_LOAN_MARGIN_BPS = 100n;
const BPS = 10000n;
const WAD = 10n ** 18n;

export interface SizingSession {
  marketOpen: boolean;
  assetReasonCode: string | null;
  reasonMsg?: string | null;
  nextOpenTime?: number | null;
}

export type NoticeCode = "MARKET_CLOSED" | "ASSET_PAUSED" | "ASSET_LIMITED" | "ABOVE_SAFE";

export interface Notice {
  code: NoticeCode;
  message: string;
  nextOpenTime?: number | null;
}

export interface SizingInput {
  /** Total collateral after the plan (existing position plus new), raw units. */
  collateralRaw: bigint;
  collateralDecimals: number;
  /** 8-decimal USD prices from the market oracle. */
  collateralPrice: bigint;
  loanPrice: bigint;
  loanDecimals: number;
  /** 1e18 scale, from the market params. */
  lltv: bigint;
  /** Existing debt in loan units. */
  existingDebt: bigint;
  /** Market liquidity in loan units. */
  availableLiquidity: bigint;
  session: SizingSession;
}

export interface Sizing {
  collateralValueLoan: bigint;
  maxBorrowTotal: bigint;
  maxBorrowNew: bigint;
  safeBorrowNew: bigint;
  /** 0.60 or 0.45. */
  buffer: number;
  notices: Notice[];
}

const isTrading = (code: string | null) => code === null || code.toUpperCase() === "TRADING";
const pow10 = (n: number) => 10n ** BigInt(n);
const floor0 = (v: bigint) => (v > 0n ? v : 0n);
const min = (a: bigint, b: bigint) => (a < b ? a : b);

export function collateralValueInLoan(input: SizingInput): bigint {
  if (input.loanPrice <= 0n) return 0n;
  return (
    (input.collateralRaw * input.collateralPrice * pow10(input.loanDecimals)) /
    (input.loanPrice * pow10(input.collateralDecimals))
  );
}

export function sessionNotices(session: SizingSession): Notice[] {
  const notices: Notice[] = [];
  if (!session.marketOpen) {
    const when = session.nextOpenTime ? new Date(session.nextOpenTime).toISOString() : null;
    notices.push({
      code: "MARKET_CLOSED",
      message: when
        ? `US market closed until ${when}, so we keep extra room`
        : "US market closed, so we keep extra room",
      nextOpenTime: session.nextOpenTime ?? null,
    });
  }
  if (!isTrading(session.assetReasonCode)) {
    const reason = session.reasonMsg || session.assetReasonCode || "corporate action";
    const limited = /limit|earning/i.test(`${session.assetReasonCode ?? ""} ${session.reasonMsg ?? ""}`);
    notices.push(
      limited
        ? {
            code: "ASSET_LIMITED",
            message: `${reason} today: conversion is limited, borrowing uses extra room`,
          }
        : {
            code: "ASSET_PAUSED",
            message: `${reason} today: conversion paused, borrowing uses extra room`,
          },
    );
  }
  return notices;
}

export function computeSizing(input: SizingInput): Sizing {
  const openAndTrading = input.session.marketOpen && isTrading(input.session.assetReasonCode);
  const bufferBps = openAndTrading ? BUFFER_OPEN : BUFFER_CLOSED;
  const value = collateralValueInLoan(input);
  const maxTotal = (value * input.lltv) / WAD;
  const safeTotal = (value * input.lltv * bufferBps) / (WAD * BPS);
  return {
    collateralValueLoan: value,
    maxBorrowTotal: maxTotal,
    maxBorrowNew: min(floor0(maxTotal - input.existingDebt), input.availableLiquidity),
    safeBorrowNew: min(floor0(safeTotal - input.existingDebt), input.availableLiquidity),
    buffer: Number(bufferBps) / Number(BPS),
    notices: sessionNotices(input.session),
  };
}

/** Lista reverts when debt ends below minLoan. 1% headroom covers loan-token price moves before the tx lands. Rounds up. */
export function minLoanFloor(minLoan: bigint): bigint {
  if (minLoan === 0n) return 0n;
  const scale = BPS + MIN_LOAN_MARGIN_BPS;
  return (minLoan * scale + BPS - 1n) / BPS;
}
