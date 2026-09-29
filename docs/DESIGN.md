# Lendhold Design System

## 1. Principles

1. Plain money language. No DeFi vocabulary on primary screens: say "your stock", "safe to borrow", "price where risk starts". Technical detail (market id, LLTV, calldata) lives behind a "Details" disclosure.
2. The share count is the hero. Every flow shows the number of shares held before and after, and it does not change.
3. Show everything before commit. The review screen lists what you keep, what you get, the cost, the risk line, and every step.
4. Real data only. No placeholder numbers in shipped screens. Empty and error states are designed screens, not blank areas.
5. Light mode only. White canvas, black primary button, one semantic green.

## 2. Tokens

### Color

| Token | Hex | Role |
|---|---|---|
| `--canvas` | `#FFFFFF` | Page background |
| `--surface` | `#F3F5F2` | Grouped regions, input fields, disclosure panels |
| `--ink` | `#0C0F0D` | Headlines, primary button fill, key numbers |
| `--body` | `#3F4541` | Body text |
| `--muted` | `#6B716D` | Secondary text and labels |
| `--border` | `#E2E6E1` | Dividers and input borders |
| `--hold` | `#0A7A46` | Held share count, Safe state, success. Never a button fill |
| `--hold-tint` | `#E6F4EC` | Background for held and Safe labels |
| `--watch` | `#9A5B00` | Watch state text and icons |
| `--watch-tint` | `#FFF3D6` | Watch background |
| `--risk` | `#C2352C` | At risk state, destructive confirmations, errors |
| `--risk-tint` | `#FDECEA` | Risk background |
| `--on-ink` | `#FFFFFF` | Text on primary buttons |

Rules:

- `--hold` appears only on held counts, Safe labels, and completed steps.
- The primary button is always `--ink` fill with `--on-ink` text. One primary button per screen.
- No gradients. No indigo or violet anywhere.

### Typography

| Style | Font | Size / line | Weight | Use |
|---|---|---|---|---|
| Display | Instrument Sans | 44 / 48 (mobile 36 / 40) | 700 | Borrow amount, hero headline |
| H1 | Instrument Sans | 28 / 34 | 600 | Screen titles |
| H2 | Instrument Sans | 20 / 26 | 600 | Section titles |
| Body | Instrument Sans | 16 / 24 | 400 | Text |
| Label | Instrument Sans | 13 / 18 | 500, letter-spacing 0.02em | Field labels, uppercase status labels (letter-spacing 0.06em) |
| Number | IBM Plex Mono | 16 / 24 | 500, tabular figures | Share counts, prices, amounts in lists |
| Code | IBM Plex Mono | 13 / 18 | 400 | Tx hashes, market ids in Details |

Load both fonts with `next/font/google`. Apply `font-variant-numeric: tabular-nums` to every number.

### Spacing, radius, elevation

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 16px buttons and inputs, 20px interactive panels, 999px status pills.
- No shadows on static content. Interactive panels use a 1px `--border`; hover darkens the border to `--muted`.
- Mobile first: content max width 440px in the app; landing max width 1080px.

### Motion

- 150ms ease-out for hover and press. 250ms for step status changes.
- The held share counter never animates its value. It may pulse its label once when a run completes.
- Respect `prefers-reduced-motion`.

## 3. Brand assets

- Mark: two vertical rounded bars side by side. Left bar tall (the stock you keep), right bar shorter and offset right (the cash you draw). Solid `--ink` on light backgrounds.
- Wordmark: lowercase `lendhold`, Instrument Sans 600, letter-spacing -0.02em.
- Lockup: mark left, wordmark right, gap equal to the right bar's width.
- Favicon: mark only, 32px and 16px, bars at least 3px wide at 16px.
- Tagline: "Borrow against your stocks. Keep them."
- Sponsor line (footer only, text): "Built for BNB Hack: Tokenized Stocks Edition". No sponsor logos or seals unless official assets are supplied.

## 4. Components

| Component | Spec |
|---|---|
| PrimaryButton | Full width on mobile, 52px tall, `--ink` fill, 16px radius, label 16/600. Disabled: `--border` fill, `--muted` text |
| SecondaryButton | 52px, 1px `--ink` border, transparent fill |
| AmountInput | Display style number, currency prefix in `--muted`, caret on the right, numeric keypad on mobile |
| HeldCounter | Mono number plus ticker (`2.000 NVDA`) and a pill `held` in `--hold` on `--hold-tint` |
| StatusPill | 999px radius, label style uppercase. Variants: ready (`--hold`), convert (`--watch`), unsupported (`--muted` on `--surface`) |
| HoldingRow | Logo, ticker and company, issuer label, shares (mono), value, StatusPill. Tappable when status is ready or convert |
| BreakdownList | Rows of label left and value right, 1px dividers, no container |
| StepList | Numbered steps; each shows name, state icon (pending circle, spinner, check in `--hold`, cross in `--risk`), and a tx link once sent |
| HealthBadge | Word (SAFE / WATCH / AT RISK) in the matching semantic colors plus the risk price below |
| CushionRuler | Horizontal line from the risk price (left, `--risk` tick) to the current price (right, `--ink` marker), labelled "cushion 41%" above the line in Label style. Fill between the two ends uses the current health color at low opacity. On Borrow it updates as the amount changes (marker glides 200ms). When the underlying market is closed, a dashed segment shows the extra room kept |
| Notice | Inline message with icon: info (`--surface`), watch, risk. Used for market closed, pauses, errors |
| Details | Disclosure row "Details" revealing market, LLTV, oracle price, market id, contract addresses in Code style |

Icons: Lucide, 20px, 1.75 stroke. No emoji.

## 5. Routes and screens

| Route | Screen |
|---|---|
| `/` | Landing |
| `/app` | Connect and holdings |
| `/app/borrow/[token]` | Borrow amount |
| `/app/review/[planId]` | Review |
| `/app/run/[runId]` | Progress and success |
| `/app/loan/[marketId]` | Loan home and repay |
| `/agent` | Operator console (agent path, token-gated) |
| `/runs` | Public run history with tx links |

### 5.1 Landing `/`

```
+---------------------------------------------------------------+
| [mark] lendhold                               [ Open app ]    |
|                                                               |
| Need cash? Keep your stocks.                                  |
| Borrow dollars against your US stocks on BNB Chain.           |
| No broker. No selling.                                        |
|                                                               |
| [ See what you can borrow ]                                   |
|                                                               |
| NVIDIA $227.54  market open  borrow up to 45% safely          |  <- live strip, RWA API
|---------------------------------------------------------------|
| Sell                         | Borrow with Lendhold           |
| You lose 2 NVDA              | You keep 2.000 NVDA            |
| You get $455                 | You get $200 now               |
| If NVIDIA rises, you miss it | Repay when you are ready       |
|---------------------------------------------------------------|
| How it works                                                  |
| 1 Pick a stock   2 Choose a safe amount   3 Get USDT          |
|---------------------------------------------------------------|
| The honest part                                               |
| If your stock falls below the risk price, part of it is sold  |
| to repay the loan. We show that price before you borrow.      |
|---------------------------------------------------------------|
| Built for BNB Hack: Tokenized Stocks Edition                  |
+---------------------------------------------------------------+
```

The live strip uses real RWA data. If data fails, the strip is hidden, not faked.

### 5.2 Holdings `/app`

```
+-------------------------------+
| Your stocks                   |
| 0x12..ab  [Disconnect]        |
|                               |
| NVIDIA  NVDAB  bStocks        |
| 2.000 shares   $455.08  READY |
|-------------------------------|
| Apple   AAPLon Ondo           |
| 1.003 shares   $331.50 CONVERT|
|  Weekdays during market hours |
|-------------------------------|
| AMD     AMDx   xStocks        |
| 0.500 shares  UNSUPPORTED     |
|  Not supported on BSC yet     |
+-------------------------------+
```

States:

- Not connected: headline "Connect your wallet to see what you can borrow", PrimaryButton "Connect wallet".
- No stock tokens: "No stocks in this wallet yet", PrimaryButton "Buy your first stock" (USDT to bStock).
- Loading: row skeletons with fixed heights.
- Region notice on first visit with a confirm checkbox.

### 5.3 Borrow `/app/borrow/[token]`

```
+-------------------------------+
| Borrow against NVIDIA         |
| 2.000 NVDA held               |
|                               |
|          $200                 |
|                               |
| Safe up to $204               |
| Most you can borrow $340      |
| (i) US market closed until    |
|     Mon 13:30 UTC, so we keep |
|     extra room.               |
|                               |
| You receive USDT              |
| [ Review ]                    |
+-------------------------------+
```

- Amount above safe but below max: Notice (watch) "This is above the safe amount. A drop of X% would put your stock at risk."
- Amount above max: PrimaryButton disabled, Notice (risk) with the reason (limit or market liquidity).
- Asset paused: whole screen replaced by Notice (risk) "NVIDIA is paused for a dividend today. Try again after [time]."

### 5.4 Review `/app/review/[planId]`

```
+-------------------------------+
| Review                        |
| You keep     2.000 NVDA  held |
| You get      200.00 USDT      |
| You owe      200.00 USD1      |
| Interest     x.xx% a year     |
| Risk price   NVIDIA < $151.20 |
|  Below this, part of your     |
|  stock is sold to repay.      |
|-------------------------------|
| Steps                         |
| 1 Allow NVDAB     simulated ok|
| 2 Deposit NVDAB   checked     |
| 3 Borrow USD1     checked     |
| 4 Swap to USDT    checked     |
| > Details                     |
| [ Confirm and borrow ]        |
+-------------------------------+
```

- "simulated ok" means Transaction API simulation passed. "checked" means precheck passed and the step is simulated again right before sending.
- A failed simulation or precheck disables the button and shows Notice (risk) with the reason.

### 5.5 Progress and success `/app/run/[runId]`

```
+-------------------------------+      +-------------------------------+
| Borrowing                     |      | Done                          |
| 1 Allow NVDAB    done  tx ->  |      | You still hold  2.000 NVDA    |
| 2 Deposit NVDAB  done  tx ->  |      | You received    200.00 USDT   |
| 3 Borrow USD1    waiting...   |      | Risk price      $151.20       |
| 4 Swap to USDT   pending      |      | [ View my loan ]              |
+-------------------------------+      +-------------------------------+
```

- Failed step: cross icon, reason, SecondaryButton "Retry this step".
- Agent runs show "Running on Agentic Wallet" under the title.

### 5.6 Loan home `/app/loan/[marketId]`

```
+-------------------------------+
| SAFE                          |
| Risk starts at $151.20        |
| NVIDIA now     $227.54        |
| You owe        200.41 USD1    |
| 2.000 NVDA held               |
| [ Repay ]    [ Add stock ]    |
| > Details                     |
+-------------------------------+
```

Repay sheet: AmountInput with "Repay all" shortcut, review rows, then the same StepList pattern.

### 5.7 Operator console `/agent`

```
+----------------------------------------------+
| Agent                      session: connected|
| Wallet 0xAg..01   Developer Mode: on         |
| Daily left: $4,980 DeFi, $9,990 contract     |
|                                              |
| What do you need?                            |
| [ I need $50 without selling my NVIDIA ]     |
| [ Plan ]                                     |
|                                              |
| Plan preview (same Review layout)            |
| [ Confirm and run on Agentic Wallet ]        |
|                                              |
| Live steps (same StepList)                   |
+----------------------------------------------+
```

States: session missing (show sign-in steps with pairing code), Developer Mode off, quota exhausted.

## 6. Copy rules

- Product screens say "keep your shares", never "keep your tokens". When a conversion changes the token (Ondo to bStock), Review states it with the exact cost: "Your NVDAon becomes NVDAB. 0.1000 shares become 0.0998 shares (0.2% conversion cost)." Borrowing directly against a bStock keeps the share count identical.
- The debt asset is always named as it is: "You owe 200.41 USD1". If a final swap delivers USDT, Review shows both lines: "You get 200.00 USDT" and "You owe USD1".
- The tagline "Borrow against your stocks. Keep them." appears only on the landing page, next to the honest-part section with the risk explanation.
- Sentence case everywhere except status pills.
- Numbers: USD with 2 decimals; shares with 3 decimals; prices with 2 decimals.
- Never say "guaranteed", "risk-free", or "investment advice". Say "We show facts. You decide."
- Errors state what happened and what to do next in one or two sentences.

## 7. Accessibility

- Contrast: body and muted text pass WCAG AA on `--canvas` and `--surface`.
- Every icon-only control has an accessible label.
- Focus ring: 2px `--ink` outline offset 2px.
- Touch targets at least 44px.

## 8. Build order

Build one screen at a time and check it against this file before starting the next: tokens and fonts, then Holdings, Borrow, Review, Progress, Loan home, Landing, Operator console, Run history.
