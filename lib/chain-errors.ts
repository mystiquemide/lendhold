/**
 * Plain-language versions of common wallet and node errors. Unknown messages pass through,
 * shortened, so nothing is hidden from the person who has to act on it.
 */
export function friendlyChainError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("insufficient funds") || m.includes("gas required exceeds") || m.includes("insufficient balance for gas"))
    return "Not enough BNB for gas. Add a little BNB to this wallet, then try this step again.";
  if (m.includes("nonce too low") || m.includes("replacement transaction underpriced") || m.includes("already known"))
    return "Your wallet has another transaction waiting. Let it finish, then try this step again.";
  if (m.includes("user rejected") || m.includes("user denied"))
    return "You cancelled in your wallet. Nothing was sent for this step.";
  if (m.includes("execution reverted") || m.includes("revert"))
    return "The network rejected this step, so nothing changed. Refresh the plan and try again.";
  const short = raw.length > 140 ? `${raw.slice(0, 140)}…` : raw;
  return `Your wallet couldn't send this step (${short}). Nothing was sent. Try again.`;
}
