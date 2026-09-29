export interface ExpectedTx {
  from: string;
  to: string;
  selector: string;
}

export interface ObservedTx {
  status: "success" | "reverted";
  from: string;
  to: string | null;
  input: string;
}

export type VerifyResult = { ok: true } | { ok: false; code: string; message: string };

/** Confirms a mined transaction is the planned call: succeeded, sent by the run owner, to the planned contract, with the planned function. */
export function verifyTx(observed: ObservedTx, expected: ExpectedTx): VerifyResult {
  if (observed.status !== "success") {
    return { ok: false, code: "TX_REVERTED", message: "That transaction failed on-chain" };
  }
  if (observed.from.toLowerCase() !== expected.from.toLowerCase()) {
    return { ok: false, code: "TX_WRONG_SENDER", message: "That transaction was not sent by the run's wallet" };
  }
  if (!observed.to || observed.to.toLowerCase() !== expected.to.toLowerCase()) {
    return { ok: false, code: "TX_WRONG_TARGET", message: "That transaction went to a different contract than planned" };
  }
  if (!observed.input.toLowerCase().startsWith(expected.selector.toLowerCase())) {
    return { ok: false, code: "TX_WRONG_CALL", message: "That transaction called a different function than planned" };
  }
  return { ok: true };
}
