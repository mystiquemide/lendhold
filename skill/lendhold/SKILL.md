---
name: lendhold
description: |
  Borrow stablecoins against tokenized US stocks on BNB Chain without selling them, from the user's own
  Binance Agentic Wallet, using the Lendhold planner API and the `baw` CLI.
  Use this skill when users ask to:
  - borrow cash, USDT or stablecoins against stock tokens they already hold (bStocks, or Ondo tokens converted first)
  - repay a stock-backed loan or withdraw the collateral
  - buy a bStock with USDT to use as collateral, or deposit a bStock as collateral without borrowing
  - see which of their stock tokens can be borrowed against, and how much is safe
  NOT for general token swaps, sending tokens, or non-stock assets: use binance-agentic-wallet for those.
version: 0.1.0
license: MIT
metadata:
  author: lendhold
  version: '0.1.0'
  requiredCliVersion: '1.10.0'
  openclaw:
    requires:
      bins:
        - baw
    install:
      - kind: node
        package: '@binance/agentic-wallet'
        bins: [baw]
        label: Install Binance Agentic Wallet CLI (npm)
---

# Lendhold Skill

Lendhold plans stock-backed loans on Lista Lending (Moolah) on BNB Chain. This skill lets an AI tool run those plans
from the user's **own** Agentic Wallet: Lendhold builds and checks the plan, the user confirms, and `baw` signs every step.
Lendhold never holds keys and never signs anything.

## Setup

- `baw` 1.10.0 or newer, signed in (`baw wallet status --json` shows `CONNECTED`).
- Developer Mode on in the Binance App. Contract calls need it.
- `LENDHOLD_API`: the base URL of a deployed Lendhold server. **Set it to the deployed URL. There is no default.**
  If it is not set, stop and ask the user for it.

Read the [binance-agentic-wallet](https://github.com/binance/binance-skills-hub) skill first if you have not: this skill relies on its
`baw` syntax and follows its safety rules. Every `baw` command here ends with `--json`.

## Flow

| # | Step | Command or call | Reference |
|---|------|-----------------|-----------|
| 1 | Check the wallet session | `baw wallet status --json` (must be `CONNECTED`) | |
| 2 | Get the user's BSC address | `baw wallet address --json`, entry with `binanceChainId` `"56"` | |
| 3 | Check limits | `baw wallet settings --json`: `devMode.enabled`, `devMode.dailyLimit` minus `developerModeQuotaUsed`, `quotaLeft` | [safety.md](references/safety.md) |
| 4 | See what can be borrowed against | `GET {LENDHOLD_API}/api/holdings?address=<address>` | [plan-api.md](references/plan-api.md) |
| 5 | Build a plan | `POST {LENDHOLD_API}/api/plan` | [plan-api.md](references/plan-api.md) |
| 6 | Show the plan and get confirmation | plain words, from the plan fields | [plan-api.md](references/plan-api.md) |
| 7 | Record the run | `POST {LENDHOLD_API}/api/runs` with `path: "skill"` | [execution.md](references/execution.md) |
| 8 | Run each step in order | `baw contract-call` or `baw market-order`, then report the hash to Lendhold | [execution.md](references/execution.md) |

## Rules

- **Only the wallet address from `baw wallet address` may be used** as `address` for holdings and plans. Never ask for or accept another address.
- **Confirm before every state change.** Show what will happen in plain words and wait for a clear yes. One confirmation for the whole plan is not enough: confirm each transaction after its preview.
- **Stop on anything unexpected**: a blocker, a risk, an intercepted preview, a failed simulation, a quote that is worse than the plan, or any CLI error. Relay the message exactly as returned and do not retry with different parameters.
- **Never substitute another action.** If a step cannot run, stop and ask. Never turn a failed contract call into a swap or a different market order.
- **Use only addresses that come from the plan.** Do not type, guess or "fix" token or contract addresses.
- **Nothing here is investment advice.** Borrowing against stocks can lead to liquidation if the stock falls. Remind the user to do their own research, and do not recommend an asset or a loan size beyond what the plan states.

## Reading the plan

Amounts in the API are decimal strings in the token's smallest unit. Convert with the `decimals` next to them.
The plan's `display`, `sizing`, `notices`, `blockers` and `steps` fields are described in [plan-api.md](references/plan-api.md).
If `blockers` is not empty there is nothing to run: tell the user each blocker message and stop.
