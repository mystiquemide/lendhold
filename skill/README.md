# Lendhold skill

A skill for AI tools that lets a user borrow stablecoins against tokenized US stocks on BNB Chain from their own
Binance Agentic Wallet. Lendhold plans and checks the loan; the user's `baw` session signs every step.

The skill lives in [`lendhold/`](./lendhold): `SKILL.md` plus `references/` for the plan API, step execution and safety rules.

## Requirements

- Node.js 22 or newer
- The Binance Agentic Wallet CLI, `baw` 1.10.0 or newer, signed in, with Developer Mode on
  (`npm install -g @binance/agentic-wallet`, then see the [binance-agentic-wallet skill](https://github.com/binance/binance-skills-hub) for sign-in)
- A running Lendhold server. Set `LENDHOLD_API` to its URL:

  ```bash
  export LENDHOLD_API=https://lendhold.midelabs.xyz
  ```

## Install

With the Skills CLI, the same way Binance Skills Hub is installed:

```bash
npx skills add https://github.com/mystiquemide/lendhold --skill lendhold
```

Or copy the folder into your tool's skills directory, for example for Claude Code:

```bash
mkdir -p ~/.claude/skills && cp -r skill/lendhold ~/.claude/skills/lendhold
```

Install the official `binance-agentic-wallet` skill too. Lendhold relies on its `baw` syntax and safety rules:

```bash
npx skills add https://github.com/binance/binance-skills-hub --skill binance-agentic-wallet
```

## Try it

Ask your AI tool, for example: "What can I borrow against my stock tokens?" or "Borrow 50 dollars against my NVIDIA bStock."
The skill shows the plan (shares you keep, what you receive, what you owe, interest, the price where it is at risk) and asks you to confirm before it signs anything.

This is not investment advice. Borrowing against stocks can lead to liquidation.
