# Lendhold

Borrow against your tokenized stocks on BNB Chain. Keep them.

Live app: [lendhold.midelabs.xyz](https://lendhold.midelabs.xyz) · Demo video: pending · [Run history](https://lendhold.midelabs.xyz/proof)

## The problem

People outside the US who hold US stocks and need dollars usually have two options: sell the position, or go without.
On BNB Chain, 618 stock tokens are live across three issuers: 442 Ondo, 130 xStocks and 46 bStocks (Binance Web3 RWA API, 5 Oct 2026).
Only bStocks are accepted as collateral on BSC lending markets, so most holders have no way to borrow against what they own.
Where borrowing does exist, on Lista Lending, it runs through interfaces built for DeFi users: approve, deposit, borrow and swap, one step at a time.
Lendhold turns that into one reviewed plan, signed from your own wallet.

## Try it in 60 seconds

1. Open [lendhold.midelabs.xyz/app](https://lendhold.midelabs.xyz/app).
2. Confirm you're eligible to hold tokenized stocks, then connect a wallet on BNB Chain. Tokenized stocks aren't available to US persons or in other restricted regions.
3. Your stock tokens are listed with their value. Tap Borrow on a bStock such as NVDAB or TSLAB.
4. See the safe amount, the most you can borrow, Lista's minimum loan and the price where risk starts.
5. Open Review to see the shares you keep, what you get, what you owe, the interest and every step, each checked before signing.
6. Confirm, and sign each step in your wallet. A borrow needs about $35 of stock to clear Lista's minimum loan of about 15 USDC. Adding and withdrawing stock work with a few dollars.

Every finished run is listed at [lendhold.midelabs.xyz/proof](https://lendhold.midelabs.xyz/proof).

## Proof

BNB Smart Chain mainnet (chain ID 56). Lending on Lista Moolah at [`0x8F73…5D8C`](https://bscscan.com/address/0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C). Each step below was confirmed by the server: it succeeded, came from the run's wallet, and called the contract and function the plan said.

| Date (UTC) | Path | Action | Shares in Lista, before → after | Transactions |
|---|---|---|---|---|
| 30 Sep 2026 | Agentic Wallet | Deposit NVDAB | 0 → 0.0122 | [approve](https://bscscan.com/tx/0x6194a361c0f351dece9eb0dec031aa1ff3b09ce9b947997d39e3e235397f4889), [deposit](https://bscscan.com/tx/0x948577def0b38edb83ee8a3e0554300beb1a220cd2c74021114b273ec8145620) |
| 30 Sep 2026 | Agentic Wallet | Withdraw NVDAB | 0.0122 → 0 | [withdraw](https://bscscan.com/tx/0xdac18e949902b564391a24e06b47ac83b681fab8e3c6f6f6433079932c0cfa2a) |
| 5 Oct 2026 | Browser wallet | Deposit TSLAB | 0 → 0.0189 | [approve](https://bscscan.com/tx/0xe89db7d818b509410a4a4c1232d8430f501dcf00f712fb22ae79dd90370ce1aa), [deposit](https://bscscan.com/tx/0x3e8af4cc62fbc997c5721b6480fba50a09100b793340d49605ef1560ff6391e2) |
| 5 Oct 2026 | Browser wallet | Withdraw TSLAB | 0.0189 → 0 | [withdraw](https://bscscan.com/tx/0xee6a242e10a870d47a2c378b48203b5567bcd254eba4efbf1f1d79e62847386a) |
| 5 Oct 2026 | Browser wallet | Deposit TSLAB | 0 → 0.0080 | [approve](https://bscscan.com/tx/0xbe39e809eef6962e3a6fa8d383f29b49556443eef387aa12e7131858130ab97a), [deposit](https://bscscan.com/tx/0xea8d755615832cdd6fccc5e0c6baf2be016dcb662eb16844af881bd1b8765cf5) |
| 5 Oct 2026 | Browser wallet | Withdraw TSLAB from the loan screen | 0.0080 → 0 | [withdraw](https://bscscan.com/tx/0xd507edbad8f608c34c37488e0c633e9b096e26d1e719637d7d64d968ebe6f2e1) |

Borrow, repay and Ondo conversion are built and tested but haven't run on mainnet yet.

## How it works

1. Read the wallet's stock tokens and their per-share value.
2. Pick the Lista market with room, and size a safe amount with extra room when the US market is closed.
3. Build the steps (approve, deposit, borrow, optional swap to USDT) and simulate or pre-check each one.
4. The user reviews and confirms. The browser wallet or the Agentic Wallet signs each step.
5. The server marks a step confirmed only after its receipt matches the planned sender, contract and function.

```mermaid
flowchart LR
  W[Browser wallet or Agentic Wallet] -->|holdings, plan, review| A[Lendhold app and API]
  A --> B[Binance Web3 API: Wallet, RWA, Trading, Transaction]
  A --> L[Lista Moolah on BSC]
  W -->|signs each step| C[BNB Chain]
  C -->|receipts| A
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Binance Web3 API usage

| Module | Calls | Where | What breaks without it |
|---|---|---|---|
| Wallet | Token balances | [lib/binance/wallet.ts](lib/binance/wallet.ts), used in [lib/engine/holdings.ts](lib/engine/holdings.ts) | Lendhold can't see which stocks you hold |
| RWA | Token lists, prices, asset status, market session | [lib/binance/rwa.ts](lib/binance/rwa.ts), used in [lib/engine/planner.ts](lib/engine/planner.ts) | No per-share value, and no extra room when the market is closed or an asset is paused |
| Trading | Quotes and swap builds | [lib/binance/trading.ts](lib/binance/trading.ts), used in [lib/engine/swap-eval.ts](lib/engine/swap-eval.ts) and [app/api/swap/build/route.ts](app/api/swap/build/route.ts) | No swap to USDT, no buy, no Ondo conversion |
| Transaction | Simulation | [lib/binance/transaction.ts](lib/binance/transaction.ts), used in [lib/engine/checks.ts](lib/engine/checks.ts) | Steps can't be checked before you sign |

## Agentic Wallet and the Lendhold skill

The [Lendhold skill](skill/lendhold/SKILL.md) lets your own Binance Agentic Wallet run the same plans from your AI tool. Lendhold plans and checks. You confirm the plan, and `baw` signs each step.

```bash
npm install -g @binance/agentic-wallet
npx skills add https://github.com/mystiquemide/lendhold --skill lendhold
export LENDHOLD_API=https://lendhold.midelabs.xyz
```

Then ask: "Borrow $20 against my NVIDIA bStock." The agent stops on a failed preview, a risky preview, or anything the Binance App needs to approve. The operator page at `/agent` runs plans on a server-side Agentic Wallet with a per-run cap. It needs a server with `baw` signed in, so on the hosted app it only reports that the wallet isn't available. Setup and safety rules: [skill/README.md](skill/README.md).

## Limits and honest notes

- Unaudited. Use small amounts.
- Borrow, repay and Ondo conversion haven't run on mainnet yet. Only deposit and withdraw have, on both paths.
- The loan asset is whatever the chosen Lista market lends, often USD1 or U. Review says "You owe" in that asset, even when you receive USDT.
- Ondo holders keep close to the same share count, minus a small conversion cost shown on Review, and the token changes: Ondo is swapped into the matching bStock before it's deposited.
- Ondo conversion needs both assets trading, so it pauses when the US market is closed.
- xStocks are shown as unsupported. There is no route on BSC.
- Swaps that Binance routes through a signed quote (RFQ) aren't supported in the browser yet. That step stops with a reason.
- If the stock falls to the risk price, Lista can sell part of the collateral. Lendhold shows that price before you sign. It doesn't prevent it.

## Run locally

```bash
git clone https://github.com/mystiquemide/lendhold && cd lendhold
npm install
cp .env.example .env.local   # add BINANCE_WEB3_API_KEY and BINANCE_WEB3_API_SECRET
npm test
npm run dev
```

## License

[MIT](LICENSE)
