# Lendhold Plan API

All calls go to `{LENDHOLD_API}`. Requests and responses are JSON. Public routes need no key.
Big numbers are decimal strings in raw token units (18 decimals for most tokens here, but always use the accompanying `decimals`).
Errors always look like `{ "error": { "code": "...", "message": "..." } }`. Show the `message` to the user as returned.
Routes are rate limited per IP (30 requests per minute); on HTTP 429 wait a minute.

## GET /api/holdings?address=

Stock tokens the wallet holds.

```json
{
  "address": "0x…",
  "holdings": [
    {
      "address": "0x…", "symbol": "NVDAB", "ticker": "NVDA", "platform": "bstock",
      "decimals": 18, "ratio": 1.0008, "amount": "336780006652509485",
      "shares": 0.3370, "perSharePrice": 227.95, "valueUsd": 76.88,
      "status": "ready", "reason": "Ready to borrow against",
      "matchingBStock": { "address": "0x…", "symbol": "NVDAB" }
    }
  ]
}
```

- `platform`: `bstock`, `ondo` or `xstocks`.
- `status`: `ready` (can borrow now), `convert` (Ondo token: it is swapped into the matching bStock first, at a cost shown in the plan), `unsupported` (see `reason`).
- `shares` is how many underlying shares the tokens represent. Say "shares" to the user, not tokens.
- An empty `holdings` list means no supported stock tokens in this wallet.

## GET /api/markets?collateral=&user=

Lending markets for a bStock. `selectedId` is the market Lendhold would use. Each market has `loanSymbol`, `lltv` (fraction), `availableLoan`, `availableUsd`, `aprPct`.

## GET /api/market-status?token=

```json
{ "session": { "openState": true, "marketStatus": "postmarket", "nextOpenTime": 1790726700000 },
  "asset": { "openState": true, "reasonCode": "TRADING", "reasonMsg": null } }
```

If `asset.reasonCode` is not `TRADING` the stock is paused (dividend, split, earnings). The plan will say so.

## GET /api/position?address=&market=

The user's current loan in a market: `collateral`, `debt`, `aprPct`, `risk` (`ltv`, `liquidationPricePerShare`, `cushion`, `health`), `sizing`.

## POST /api/plan

Body:

```json
{ "address": "0x…", "action": "borrow", "token": "0x…", "amount": "50" }
```

| Field | Notes |
|-------|-------|
| `address` | The wallet address from `baw wallet address` (chain 56) |
| `action` | `borrow`, `repay`, `withdraw`, `buy` or `deposit` (deposit a bStock as collateral, no loan) |
| `token` | The stock token address from `holdings` (bStock, or an Ondo token when borrowing). Never type it by hand |
| `amount` | Borrow and repay: loan units (`"all"` for repay). Withdraw: stock units or `"all"`. Buy: USDT units. Deposit: stock units, default the whole wallet balance. Omit on borrow to get the safe maximum |
| `collateralAmount` | Borrow only: stock units to deposit. Default all of the wallet's balance of that token |
| `receive` | `"USDT"` (default) or `"loan"` to keep the loan token |
| `withdraw` | Repay only: `true` with a full repay also withdraws the collateral |
| `marketId` | Optional, from `/api/markets` |

Response `{ plan, review, expiresAt }`. **A plan expires after 10 minutes** (`expiresAt`, epoch ms). Build a new plan if the user takes longer.

### What to show the user (from `plan`)

Show these in plain words and ask for a clear yes before anything runs:

| Say | Field |
|-----|-------|
| Shares you keep | `display.sharesAfter` (before: `display.sharesBefore`; change: `display.shareDeltaPct` percent) |
| You receive | `display.receive.amount` and `display.receive.symbol` (divide by `display.receive.decimals`) |
| You owe | `display.debt.amount` and `display.debt.symbol` (divide by `display.debt.decimals`) |
| Yearly interest | `display.aprPct` percent |
| Price where it is at risk | `display.riskPricePerShare` dollars per share |
| Room before that price | `display.cushionPct` percent |
| Health | `display.health`: `safe`, `watch` or `at_risk` |
| Conversion cost | `display.conversionCostPct` percent, only when not null (Ondo to bStock) |
| Safe and maximum amounts | `sizing.safeBorrowNew` and `sizing.maxBorrowNew` (loan units, use `plan.market.loanDecimals`), and `sizing.buffer` |
| Notices | every entry of `notices`: show `message` |
| Steps | each entry of `steps`: `idx + 1`, `label` |

`plan.market.minLoan` is Lista's minimum loan in loan units (divide by `plan.market.loanDecimals`). Debt must be zero or at least this amount (plus a 1% margin the plan adds), so a borrow or partial repay that would leave less is blocked with `BELOW_MIN_LOAN` or `PARTIAL_REPAY_BELOW_MIN`.

`display` and `sizing` fields can be null for `buy` plans or when nothing is available. Leave out fields that are null.
Notice codes: `MARKET_CLOSED`, `ASSET_PAUSED`, `ASSET_LIMITED`, `ABOVE_SAFE`. `ABOVE_SAFE` means the requested amount is more than the safe amount: say so clearly.

### Blockers

`plan.blockers` is a list of `{ code, message }`. When it is not empty, `steps` is empty and nothing can run. Show each `message`.
Codes include `NO_MARKET`, `NO_COLLATERAL`, `ABOVE_MAX`, `INSUFFICIENT_BALANCE`, `ASSET_NOT_TRADING`, `SWAP_COST_TOO_HIGH`, `NO_QUOTE`, `NOTHING_TO_BORROW`, `NO_DEBT`, `ABOVE_DEBT`, `INSUFFICIENT_LOAN_BALANCE`, `WOULD_LIQUIDATE`, `BELOW_MIN_LOAN`, `PARTIAL_REPAY_BELOW_MIN`.

### Review

`review.ok` says whether the plan passed the server's checks (first step simulated, balances, allowances, liquidity, gas).
`review.steps[i].status` is `simulated_ok`, `checked`, `simulated_failed` or `check_failed` with a `reason`. `review.problems` is a list of messages.
If `review.ok` is false, show `review.problems` and stop.

### Steps

Each step has `id`, `idx`, `kind` (`approve`, `supplyCollateral`, `borrow`, `swap`, `repay`, `withdrawCollateral`) and `label`.

Contract steps also have `to`, `data` (calldata, hex), `value` (wei, `"0"`), `selector`, `token` and `amount`.
Swap steps have `swap`: `from`, `to`, `fromSymbol`, `toSymbol`, `amountIn`, `minOut` (raw units), `fromDecimals`, `toDecimals`, and `quote` (`expectedOut`, `valueRatio`).

## POST /api/simulate

`{ "planId": "<plan.id>", "idx": 0 }` simulates one step against current chain state: `{ ok, reason?, raw }`.
Later steps may fail to simulate until the earlier ones are on-chain; that is expected.

## Runs

See [execution.md](execution.md) for `POST /api/runs`, `GET /api/runs/:id` and `POST /api/runs/:id/steps`.
