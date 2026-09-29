# Running a plan

Run only after the user confirmed the plan (see [plan-api.md](plan-api.md)). The wallet in the plan must be the wallet you are signing with.

## 1. Record the run

```
POST {LENDHOLD_API}/api/runs
{ "planId": "<plan.id>", "path": "skill" }
```

Response `201`: `{ "run": { "id": "...", "status": "planned", "steps": [ { "idx": 0, "kind": "approve", "status": "pending" }, … ] } }`.
Keep `run.id`. `path: "skill"` means "the user's own Agentic Wallet, driven from their AI tool". It needs no operator token.
A plan with blockers returns `409 PLAN_BLOCKED`; an expired plan returns `410 PLAN_EXPIRED` (build a new one).

## 2. Run the steps in order

For each step in `plan.steps`, in `idx` order. Do not skip ahead. Do not start a step until the previous one is confirmed by the Lendhold server.

### Contract steps (`approve`, `supplyCollateral`, `borrow`, `repay`, `withdrawCollateral`)

1. Check that Developer Mode is on: `baw wallet settings --json` must show `devMode.enabled` true.
2. Preview (this simulates and checks risk, nothing is sent):

   ```bash
   baw contract-call preview --binanceChainId 56 --from <address> --to <step.to> --value <step.value> --inputData <step.data> --json
   ```

   `--value` is in wei. Use the step's values exactly.
3. **Stop and tell the user, do not execute,** if any of these is true:
   - the preview returned an error, including an intercepted (blocked) preview. Relay the message exactly. There is no `requestId` to execute
   - `data.risks.riskDetails` has any item, or any entry in `data.risks.addresses` has a risk level
   - `data.simulationResult.simulationCode` is not `"000000000"` or `simulationErrorDetail` is not null
   - `data.requireConfirmation` is true (the wallet wants approval in the Binance App: tell the user, and only continue after they approve there)
   - `data.parsedTx` does not match the step: for `approve`, the spender must be the contract of the next step's `to` and the amount must be the step `amount`
4. Show the user `parsedTx`, `simulationResult.allowanceChanges` and `balanceChanges`, and `risks`. Ask for a clear yes for this transaction.
5. Execute with the `requestId` from the preview:

   ```bash
   baw contract-call execute --requestId <requestId> --json
   ```

   - `status` `BROADCASTED` with a `txHash`: continue.
   - `status` `PENDING_CONFIRMATION`: tell the user to approve in the Binance App. When they say it is approved, find the hash with `baw wallet tx-history --size 5 --json` (or ask the user for it) and continue.
   - Anything else or an error: stop and relay it.
6. Report the hash to Lendhold and wait for its answer:

   ```
   POST {LENDHOLD_API}/api/runs/<run.id>/steps
   { "idx": <step.idx>, "txHash": "<txHash>" }
   ```

   `200` means the server read the receipt from BNB Chain and confirmed that it succeeded, came from this wallet, went to the planned contract and called the planned function. Only then go to the next step.
   `422` with `TX_NOT_FOUND` usually means the transaction is not mined yet: wait a few seconds and post the same hash again (it is safe to repeat). Other `422` codes (`TX_REVERTED`, `TX_WRONG_SENDER`, `TX_WRONG_TARGET`, `TX_WRONG_CALL`) mean stop and show the message.

### Swap steps (`swap`)

Use the wallet's market order. Never replace it with a limit order or another kind of order.

1. Convert `step.swap.amountIn` to human units: divide by 10 to the power of `step.swap.fromDecimals`.
2. Quote:

   ```bash
   baw market-order quote --fromTokenQty <human amountIn> --fromToken <step.swap.from> --toToken <step.swap.to> --binanceChainId 56 --slippage 0.5 --json
   ```

3. Compare `data.toCoinAmount` with `step.swap.minOut` divided by 10 to the power of `toDecimals`. If the quote is lower, stop and tell the user. Do not swap.
4. Show the user the amounts and ask for a clear yes.
5. Swap:

   ```bash
   baw market-order swap --fromTokenQty <human amountIn> --fromToken <step.swap.from> --toToken <step.swap.to> --binanceChainId 56 --slippage 0.5 --json
   ```

   The response `orderId` only means submitted. Do not call it done.
6. Poll `baw market-order list --orderId <orderId> --json` until `status` is `FINISHED` or `FAILED`. `PENDING` is not final. If it is still pending after about 90 seconds, tell the user it is still processing and stop.
   - `FAILED`: tell the user it failed (its `txHash` may be null). Stop.
   - `FINISHED`: take `txHash` from the order and report it with `POST /api/runs/<run.id>/steps`, then wait for `200`.
   For swaps the server checks that the transaction succeeded and came from this wallet.

## 3. Finish

When every step is confirmed, `GET {LENDHOLD_API}/api/runs/<run.id>` returns `run.status` `done`. Tell the user what happened in plain words: the amount received, the amount owed, and the price where the loan is at risk (from the plan). If the run stopped, say which step and show the reason exactly.

## Retrying

If something stops the run, do not start over with a new plan blindly. Check `GET /api/runs/<run.id>`: steps with status `confirmed` are done. Rebuild a plan, which reads the wallet's current state (already-done approvals and deposits are skipped), and confirm it with the user again.
