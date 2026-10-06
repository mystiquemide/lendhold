import { describe, expect, it } from "vitest";
import { friendlyChainError } from "@/lib/chain-errors";

describe("friendlyChainError", () => {
  it("explains gas, nonce, rejection and revert errors", () => {
    expect(friendlyChainError("insufficient funds for gas * price + value")).toMatch(/^Not enough BNB for gas/);
    expect(friendlyChainError("nonce too low")).toMatch(/another transaction waiting/);
    expect(friendlyChainError("User rejected the request.")).toMatch(/You cancelled/);
    expect(friendlyChainError("execution reverted: 0x")).toMatch(/nothing changed/);
  });

  it("passes unknown errors through, shortened, and says nothing was sent", () => {
    const out = friendlyChainError("x".repeat(300));
    expect(out).toMatch(/Nothing was sent/);
    expect(out.length).toBeLessThan(220);
  });
});
