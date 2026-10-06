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
  nextCloseTime?: number | null;
  /** Clock for the closing-soon check, in ms. Defaults to Date.now(). */
  now?: number;
}

/** Warn this long before a close that lasts at least CLOSE_GAP_MS. Short pre-market gaps are ignored. */
export const CLOSING_SOON_MS = 4 * 60 * 60 * 1000;
export const CLOSE_GAP_MS = 60 * 60 * 1000;

export type NoticeCode = "MARKET_CLOSED" | "CLOSING_SOON" | "ASSET_PAUSED" | "ASSET_LIMITED" | "ABOVE_SAFE";

export interface Notice {
  code: NoticeCode;
  message: string;
  nextOpenTime?: number | null;
  closesAt?: number | null;
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
  /** The safe amount once the market closes (0.45 buffer). Equals safeBorrowNew while closed. */
  safeBorrowClosedNew: bigint;
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

/** When the market is open and a real close (not a short pre-market gap) is near, its time in ms. */
export function closingSoonAt(session: SizingSession): number | null {
  const { nextCloseTime: close, nextOpenTime: reopen } = session;
  if (!session.marketOpen || !close) return null;
  const left = close - (session.now ?? Date.now());
  if (left <= 0 || left > CLOSING_SOON_MS) return null;
  if (reopen && reopen > close && reopen - close < CLOSE_GAP_MS) return null;
  return close;
}

export function fmtDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function sessionNotices(session: SizingSession): Notice[] {
  const notices: Notice[] = [];
  const closesAt = closingSoonAt(session);
  if (closesAt) {
    notices.push({
      code: "CLOSING_SOON",
      message: `US market closes in ${fmtDuration(closesAt - (session.now ?? Date.now()))}, then the safe amount drops`,
      closesAt,
    });
  }
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

export function bufferBps(session: SizingSession): bigint {
  return session.marketOpen && isTrading(session.assetReasonCode) ? BUFFER_OPEN : BUFFER_CLOSED;
}

export function computeSizing(input: SizingInput): Sizing {
  const buffer = bufferBps(input.session);
  const value = collateralValueInLoan(input);
  const maxTotal = (value * input.lltv) / WAD;
  const safeTotal = (value * input.lltv * buffer) / (WAD * BPS);
  const safeClosedTotal = (value * input.lltv * BUFFER_CLOSED) / (WAD * BPS);
  return {
    collateralValueLoan: value,
    maxBorrowTotal: maxTotal,
    maxBorrowNew: min(floor0(maxTotal - input.existingDebt), input.availableLiquidity),
    safeBorrowNew: min(floor0(safeTotal - input.existingDebt), input.availableLiquidity),
    safeBorrowClosedNew: min(floor0(safeClosedTotal - input.existingDebt), input.availableLiquidity),
    buffer: Number(buffer) / Number(BPS),
    notices: sessionNotices(input.session),
  };
}

/** Lista reverts when debt ends below minLoan. 1% headroom covers loan-token price moves before the tx lands. Rounds up. */
export function minLoanFloor(minLoan: bigint): bigint {
  if (minLoan === 0n) return 0n;
  const scale = BPS + MIN_LOAN_MARGIN_BPS;
  return (minLoan * scale + BPS - 1n) / BPS;
}
