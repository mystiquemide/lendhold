export interface ExpectedTx {
  from: string;
  /** Omit to skip the target check (swaps routed by the wallet itself). */
  to?: string;
  /** Omit to skip the function check. */
  selector?: string;
  /**
   * Swaps only: the token the run's wallet should receive. The Agentic Wallet settles some swaps (Ondo tokens)
   * through a Binance relayer, so the sender is not the wallet. Such a swap still counts when its receipt shows
   * this token transferred to the run's wallet.
   */
  receives?: string;
}

/** ERC-20 Transfer(address,address,uint256). */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface ObservedTx {
  status: "success" | "reverted";
  from: string;
  to: string | null;
  input: string;
  /** Receipt logs. Needed only to check relayed swaps. */
  logs?: { address: string; topics: readonly string[] }[];
}

export type VerifyResult = { ok: true } | { ok: false; code: string; message: string };

/** Confirms a mined transaction is the planned call: succeeded, sent by the run owner, to the planned contract, with the planned function. */
export function verifyTx(observed: ObservedTx, expected: ExpectedTx): VerifyResult {
  if (observed.status !== "success") {
    return { ok: false, code: "TX_REVERTED", message: "That transaction failed on-chain" };
  }
  if (observed.from.toLowerCase() !== expected.from.toLowerCase() && !deliveredTo(observed, expected)) {
    return { ok: false, code: "TX_WRONG_SENDER", message: "That transaction was not sent by the run's wallet" };
  }
  if (expected.to !== undefined && (!observed.to || observed.to.toLowerCase() !== expected.to.toLowerCase())) {
    return { ok: false, code: "TX_WRONG_TARGET", message: "That transaction went to a different contract than planned" };
  }
  if (expected.selector !== undefined && !observed.input.toLowerCase().startsWith(expected.selector.toLowerCase())) {
    return { ok: false, code: "TX_WRONG_CALL", message: "That transaction called a different function than planned" };
  }
  return { ok: true };
}

/** True when the receipt has a Transfer of `expected.receives` to the run's wallet. */
function deliveredTo(observed: ObservedTx, expected: ExpectedTx): boolean {
  if (!expected.receives || !observed.logs) return false;
  const token = expected.receives.toLowerCase();
  const wallet = expected.from.toLowerCase().replace(/^0x/, "");
  return observed.logs.some(
    (l) =>
      l.address.toLowerCase() === token &&
      l.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
      l.topics[2]?.toLowerCase().endsWith(wallet),
  );
}
