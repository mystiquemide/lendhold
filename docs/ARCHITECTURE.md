# Lendhold Architecture

Lendhold borrows stablecoins against tokenized US stocks on BNB Smart Chain (BSC, chain 56). One engine builds a plan; two executors run it: the user's browser wallet, or the Binance Agentic Wallet driven by a server-side agent.

## 1. System overview

```
                  +---------------------------------------------+
Browser  -------> |  Next.js app (App Router)                    |
(EIP-6963/viem)   |                                             |
   |              |  UI routes        /, /app, /app/borrow, ... |
   |              |  API routes       /api/*  (server only)     |
   |              |       |                                     |
   |              |  Engine (lib/engine)                        |
   |              |   holdings, parity, sizing, planner,        |
   |              |   prechecks, risk math                      |
   |              |       |               |                     |
   |              |  Binance Web3 API   Lista (Moolah)          |
   |              |  (lib/binance)      (lib/lista)             |
   |              |       |               |                     |
   |              |  Agent executor (lib/agent) -> baw CLI      |
   |              |  Run store (SQLite)                         |
   |              +---------------------------------------------+
   |                     |                  |
   v                     v                  v
 BSC RPC <------- Binance Web3 API    api.lista.org, Moolah contract
 (signed txs)     (RWA, Market, Trading,
                   Transaction, Wallet, DeFi)
```

- The Binance API key and secret never reach the browser. All Binance Web3 API calls go through `/api/*`.
- The browser path signs and sends transactions from the user's wallet. The server builds and simulates them.
- The agent path runs on the server with the operator's Agentic Wallet session (`baw` CLI). Agent routes require an operator token.

## 2. Stack

| Layer | Choice | Reason |
|---|---|---|
| App | Next.js (App Router), TypeScript, Tailwind CSS | One deployable for UI and API routes |
| Wallet (browser) | EIP-6963 wallet discovery (Binance Wallet listed first) with viem for encoding and reads | Works with any injected BSC wallet, no wallet SDK |
| Chain reads | viem public client on BSC RPC | Moolah state, oracle prices, ERC-20 balances and allowances |
| Binance Web3 API | `@binance-web3/wallet` 12.3.0 (pinned) | Official connector with request signing |
| Agent execution | `@binance/agentic-wallet` CLI (`baw`), called from the server with `child_process` | Required for Agentic Wallet execution |
| Intent parsing | OpenAI Chat Completions with a JSON schema response | Parses plain-language requests only |
| Run store | SQLite (`better-sqlite3`) | Durable run history for both paths |
| Tests | Vitest | Engine math, calldata encoding, API route contracts |
| Hosting | VPS behind Caddy (HTTPS) | The agent needs a persistent local `baw` session; the link must stay up through judging (to 23 Oct) |

Exact package versions are pinned at scaffold time. Prefer versions published at least 7 days earlier.

## 3. External integrations

### 3.1 Binance Web3 API (server)

| Module | Calls | Used for |
|---|---|---|
| RWA Data | `getRwaTokenIssuancePlatforms`, `getRwaTokenList`, `searchRwaToken`, `getRwaTokenPrice`, `getRwaUnderlyingMarketData`, `getRwaUnderlyingInfo` | Token lists per issuer, token price and per-share reference price, market status and next open, asset status and corporate-action reason codes |
| General Data (Market) | `getTokenPrice`, `getCandles` | Stablecoin prices, sparkline on holdings |
| Wallet | `getAllTokenBalancesByAddress` | Holdings for a connected address |
| Trading | `getAggregatedQuote`, `buildSwapTransaction`, `getErc20ApproveTransaction`, `submitRfqOrder`, `getRfqOrderStatus`, `getTransactionStatus` | Buy bStock, Ondo conversion legs, final swap to USDT |
| Transaction | `simulateTransactions`, `getGasPrice`, `getGasLimit`, `broadcastTransactions` (agent fallback only) | Per-step simulation, gas |
| DeFi Data | `getDeFiPositions` | Cross-check positions where the API covers them |

The public RWA list endpoint (`https://www.binance.com/bapi/defi/.../rwa/stock/detail/list/ai?type=`) is used only to show xStocks holdings as unsupported. The keyed RWA API does not list xStocks.

Known behaviours to handle (verified 29 Sep 2026):

- Issuer-to-issuer quotes return `null`. Ondo conversion is two legs through USDT.
- RFQ routes (Ondo, bStock) require `userWalletAddress` on the quote, and the swap may carry `rfq.typedDataToSign` that the same wallet must sign.
- `simulateTransactions` takes one EVM transaction, with no bundle and no state overrides.
- `listDeFiInvestments` ignores `contractAddresses`.
- Quotes can come back as normal responses with extreme price impact (a USDT to MSFTon route through ETH, BTCB and USDC quoted at 99.95% impact). The engine rejects any quote above 1% price impact.
- The RWA `tokenPrice` equals the reference price times the share multiplier. It is not the on-chain traded price. Conversion values and costs come from live quotes.

### 3.2 Lista Lending (Moolah)

- Core contract: `Moolah` at `0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C`.
- Market discovery: `GET https://api.lista.org/api/moolah/borrow/markets?chainId=56&zone=5&page=N&pageSize=50`. Paginate until `total`; the `collateralAsset` filter is ignored, so filter locally. Cache for 60 seconds.
- On-chain reads per market id: `idToMarketParams(bytes32)`, `market(bytes32)`, `position(bytes32,address)`, `isWhiteList(bytes32,address)`, `providers(bytes32,address)`, `brokers(bytes32)`.
- Oracle: `IOracle(marketParams.oracle).peek(token)` returns a USD price with 8 decimals (verified: NVDAB 22787718629 = $227.88, USD1 99956000 = $0.9996).
- Writes, encoded with viem from the `IMoolah` ABI (`lista-dao/moolah`, `src/moolah/interfaces/IMoolah.sol`):

| Action | Function |
|---|---|
| Deposit collateral | `supplyCollateral(MarketParams, uint256 assets, address onBehalf, bytes data)` with `data = 0x` |
| Borrow | `borrow(MarketParams, uint256 assets, uint256 shares = 0, address onBehalf, address receiver)` |
| Repay part | `repay(MarketParams, uint256 assets, uint256 shares = 0, address onBehalf, bytes data)` |
| Repay all | `repay(MarketParams, 0, position.borrowShares, onBehalf, 0x)` |
| Withdraw collateral | `withdrawCollateral(MarketParams, uint256 assets, address onBehalf, address receiver)` |

- `MarketParams = (loanToken, collateralToken, oracle, irm, lltv)`.
- ERC-20 `approve(Moolah, amount)` is required for the collateral before deposit and for the loan token before repay.
- Eligibility of a market for Lendhold: `isWhiteList(id, user) == true`, `providers(id, collateral) == 0x0`, `brokers(id) == 0x0`, `termType == 0`. Markets that fail any check are skipped.
- Verified open markets for NVDAB: `0xaa1b8576...d8b1` (NVDAB/USD1, LLTV 75%) and `0x3bcfeb26...fdce8` (NVDAB/U, LLTV 75%).

### 3.3 Venus (fallback only)

Not built for the hackathon. Kept as the documented fallback venue if a Lista interface issue appears: Core Pool vTokens for TSLAB, NVDAB, SPCXB, SKHYB; flow approve, `vToken.mint`, `Comptroller.enterMarkets`, `vUSDT.borrow`.

### 3.4 Agentic Wallet (`baw`)

| Need | Command |
|---|---|
| Session | `baw wallet status --json`, `baw auth signin --json`, `baw auth verify --qrCodeId ... --json` (operator, one time) |
| Address | `baw wallet address --json` |
| Limits | `baw wallet settings --json` (checks `devMode.enabled`, `defiQuotaLeft`, `quotaLeft`) |
| Swaps | `baw market-order quote ...`, `baw market-order swap ... --json`, then poll `baw market-order list --orderId ... --json` until `FINISHED` or `FAILED` |
| Approve, deposit, borrow, repay, withdraw | `baw contract-call preview --binanceChainId 56 --from <agentAddr> --to <contract> --inputData <hex> --json`, then `baw contract-call execute --requestId ... --json` |

- Every `baw` call runs with `--json` and a timeout. Output is parsed and stored on the run step. Errors are relayed verbatim.
- Conditional instructions that cannot be honoured stop the run and ask the user. The agent never substitutes a market order for a failed limit order.

### 3.5 OpenAI (intent only)

`POST /api/intent` sends the user's sentence with a strict JSON schema:

```json
{ "action": "borrow | repay | status | buy", "ticker": "string|null", "issuer": "bstock|ondo|null", "amountUsd": "number|null" }
```

The engine validates and resolves everything else. The model never chooses markets, amounts beyond what the user stated, or transaction data.

## 4. Engine (lib/engine)

### 4.1 Holdings

1. Wallet API balances for the address on chain 56.
2. Join against RWA token lists for `ondo` and `bstock`, and the public list for xStocks.
3. For each stock token: `perShare = tokenPrice / multiplier`, `shares = tokenAmount * multiplier`, `valueUsd = tokenAmount * tokenPrice`.
4. Status:
   - `ready`: bStock with at least one eligible Lista market with available liquidity.
   - `convert`: Ondo token whose ticker has a bStock with an eligible market. Available only when the RWA asset status is open.
   - `unsupported`: xStocks, or no route, or no eligible market.

### 4.2 Market selection

For a collateral token, pick the eligible Lista market with the highest `liquidityUsd`, preferring USDT, then USD1, then U, then USDC when liquidity is within 10% of each other. The selected market's loan token is what is borrowed. If the user asked for USDT and the loan token is not USDT, the plan adds a final swap leg.

### 4.3 Sizing

Inputs: collateral value in loan-token terms from the oracle (`collateral * peek(collateral) / peek(loan)`), market LLTV, market available liquidity, RWA market status.

- `maxBorrow = min(collateralValue * lltv, availableLiquidity)`
- `safeBorrow = min(collateralValue * lltv * buffer, availableLiquidity)` where `buffer = 0.60` when the underlying market is open and `0.45` when it is closed or paused. With LLTV 75%, that is a target LTV of 45% open (the stock can fall about 40% before liquidation) and about 34% closed (about 55% of room).
- The borrow screen shows both numbers and the sentence explaining the buffer.

### 4.4 Risk line

- `liquidationPricePerToken = debt / (collateralTokens * lltv)` in USD, using the loan-token oracle price.
- `liquidationPricePerShare = liquidationPricePerToken / multiplier`.
- Health labels: Safe when LTV <= 0.6 * LLTV, Watch when LTV <= 0.85 * LLTV, At risk above that.

### 4.5 Planner

A plan is an ordered list of steps. Each step has a kind, the transaction (`to`, `data`, `value`) or swap request, a precheck, and a status.

Borrow against a bStock:

1. `approve` collateral to Moolah (skipped if allowance is enough)
2. `supplyCollateral`
3. `borrow`
4. Optional `swap` loan token to USDT

Borrow against an Ondo token (adds before step 1):

- `swap` Ondo token to USDT
- `swap` USDT to the matching bStock

Repay: `approve` loan token, `repay`, then optional `withdrawCollateral`.

Buy first stock: `approve` USDT (if needed), `swap` USDT to bStock.

### 4.6 Prechecks and simulation

- Before review: simulate step 1 with `simulateTransactions`. Precheck every later step against live state (balances after expected earlier deltas, allowance, market liquidity, LTV after borrow, asset status).
- During execution: simulate each step immediately before sending it. A failed simulation stops the run with the reason.
- Swaps are reported done only at a terminal status (`FINISHED` or on-chain receipt), never on submit.
- A step is confirmed only after the server fetches the receipt and checks that it succeeded and that `to` and the function selector match the planned step. Browser-reported hashes that fail this check are rejected.
- Each step has a stable id. Before resending a step, the executor re-reads on-chain state (allowance, position collateral, position debt) so a retry never deposits or borrows twice.
- At confirm time the engine re-reads the oracle price; if it moved more than 1% since review, or the planned LTV now exceeds the safe amount, the run returns to review.

## 5. Executors

| | Browser executor | Agent executor |
|---|---|---|
| Runs where | Client (`/app/run/[id]`) | Server (`lib/agent`) |
| Signs with | Connected wallet (`eth_sendTransaction`) | Agentic Wallet via `baw` |
| Swaps | Trading API `buildSwapTransaction` on-chain routes. RFQ routes stop the step with a reason | `baw market-order swap` |
| Contract calls | `eth_sendTransaction` with engine calldata, simulated first | `baw contract-call preview` then `execute` |
| Confirmation | Wallet prompt per step after the user confirms the review | Operator confirms the review in the UI; the server then runs the steps |
| Status updates | Client posts each hash to `/api/runs/:id/steps`. Unmined hashes are stored as sent, so a reload waits instead of resending | Written directly to the run store |

Both write the same run record, so loan home and history work for either path.

### 5.1 Lendhold Wallet Skill

`skill/` ships a skill in the Binance Skills Hub format (`SKILL.md` plus references). It lets any Agentic Wallet user run Lendhold from their own AI tool with their own `baw` session:

1. Read the user's Agentic Wallet address with `baw wallet address`.
2. Call Lendhold's public `/api/holdings` and `/api/plan` for that address.
3. Show the plan (shares kept, amount received, debt asset, risk price) and wait for explicit confirmation.
4. For each step: `baw contract-call preview` (or `baw market-order quote` for swaps), show parsed transaction and risks, then execute only with the returned `requestId`; stop on any failed preview.
5. Report tx hashes and post them to `/api/runs/:id/steps` for server-side verification.

This makes the agent path multi-user without the server holding anyone's session.

## 6. API routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/holdings?address=` | GET | public | Normalized holdings with status |
| `/api/markets?collateral=` | GET | public | Eligible Lista markets for a collateral |
| `/api/market-status?token=` | GET | public | Underlying market status, next open, asset reason code |
| `/api/plan` | POST | public | Build plan and sizing for `{ address, action, token, amount }` |
| `/api/simulate` | POST | public | Simulate one step |
| `/api/swap/build` | POST | public | Build a swap transaction for the browser path |
| `/api/runs` | POST, GET | public for browser runs; operator for agent runs | Create and list runs |
| `/api/runs/:id` | GET | public | Run detail with steps |
| `/api/runs/:id/steps` | POST | run owner signature or browser session | Browser path step results |
| `/api/agent/run` | POST | operator token | Start an agent run from a confirmed plan |
| `/api/agent/status` | GET | operator token | `baw` session, address, limits |
| `/api/intent` | POST | operator token | Parse a plain-language request |
| `/api/position?address=&market=` | GET | public | Loan home data |

Rate limit public routes per IP. Cache market lists and RWA lists for 60 seconds.

## 7. Data model (SQLite)

```
runs(
  id TEXT PRIMARY KEY,
  path TEXT CHECK(path IN ('browser','agent')),
  address TEXT, action TEXT, token TEXT, market_id TEXT,
  plan_json TEXT, status TEXT, created_at INTEGER, updated_at INTEGER
)
run_steps(
  run_id TEXT, idx INTEGER, kind TEXT, status TEXT,
  sim_json TEXT, tx_hash TEXT, order_id TEXT, error TEXT, updated_at INTEGER,
  PRIMARY KEY(run_id, idx)
)
```

Run status: `planned`, `running`, `done`, `failed`, `stopped`. Step status: `pending`, `simulated`, `sent`, `confirmed`, `skipped`, `failed`.

## 8. Error states

| Condition | Source | User-facing result |
|---|---|---|
| Underlying market closed | RWA market status | Smaller safe amount, next open time shown |
| Asset paused (dividend, split, merger) | RWA asset status reason code | Borrow and conversion blocked for that asset, reason shown |
| Earnings limit | `ASSET_LIMITED` / `earnings` | Warning, conversion blocked |
| No eligible market or no liquidity | Lista market list and on-chain checks | "Not available to borrow right now" |
| No conversion route | Trading API returns `null` | Conversion option hidden with reason |
| Simulation failed | Transaction API | Run stops before sending, reason shown |
| Wallet rejected | Wallet error code 4001 | Run stops, can retry from that step |
| Agent session missing or Developer Mode off | `baw wallet status`, `baw wallet settings` | Operator prompt to sign in or enable Developer Mode |
| Agent quota exhausted | `baw wallet settings` | Run blocked with remaining quota shown |

## 9. Security

- Secrets (`BINANCE_WEB3_API_KEY`, `BINANCE_WEB3_API_SECRET`, `OPENAI_API_KEY`, `OPERATOR_TOKEN`) are server-only env vars. No secret is logged or returned.
- Agent routes require `OPERATOR_TOKEN` and are capped by `AGENT_MAX_USD_PER_RUN`.
- All calldata is built by the engine from on-chain market params. Token addresses come from the RWA API and Lista market data, never from user text or the model.
- Token names and symbols from APIs are treated as untrusted display text.
- Region notice and self-attestation on first use. No service offered to restricted regions.

## 10. Testing

- Unit: parity, sizing, risk line, market selection, planner step order, calldata encoding compared with `cast calldata` output.
- Integration: live read-only calls to Binance Web3 API and Lista (holdings, markets, quotes, simulation of an approve).
- End to end: one small mainnet borrow and repay per path, with transaction hashes recorded in the README.
