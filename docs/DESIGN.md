# Lendhold Design System

## 1. Principles

1. Plain money language. No DeFi vocabulary on primary screens: say "your stock", "safe to borrow", "price where risk starts". Technical detail (market id, LLTV, calldata) lives behind a "Details" disclosure.
2. The share count is the hero. Every flow shows the number of shares held before and after, and it does not change.
3. Show everything before commit. The review screen lists what you keep, what you get, the cost, the risk line, and every step.
4. Real data only. No placeholder numbers in shipped screens. Empty and error states are designed screens, not blank areas.
5. Light mode only. Gray canvas, white sheets, one violet for actions, and green, amber and red only for loan health.

## 2. Tokens

### Color

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--action` | `#594ff4` | Primary pill fill, active tab, focus ring, links in body copy, feature icons | 5.4:1 on white |
| `--action-press` | `#4a40e0` | Primary pill hover and press | |
| `--action-tint` | `#dad6f7` | Selected segment background, violet tag fill | |
| `--on-action` | `#f2f2ec` | Text on violet | 4.8:1 |
| `--ink` | `#1f1f1f` | Headings, key numbers | 16:1 |
| `--body` | `#5d5d5d` | Body text | 6.5:1 on white, 6.0:1 on canvas |
| `--muted` | `#6d6d6d` | Helper text, labels | 5.2:1 on white |
| `--line` | `#e7e7e7` | Dividers, input borders | |
| `--canvas` | `#f6f6f6` | Landing hero canvas, app page background | |
| `--sheet` | `#ffffff` | White sheet, app panels | |
| `--footer` | `#1f1f1f` | Footer | |
| `--safe` / `--safe-tint` | `#0a7a46` / `#e6f4ec` | SAFE badge, held share count, confirmed step | 4.8:1 on tint |
| `--watch` / `--watch-tint` | `#9a5b00` / `#fff3d6` | WATCH badge, above-safe notice | 4.9:1 on tint |
| `--risk` / `--risk-tint` | `#d1193e` / `#fdecee` | AT RISK badge, errors, failed step | 4.7:1 on tint |

Rules: violet appears only on things you can press or that are active, and on the logo coin. Health colors appear only on health, held counts and step results. No gradients except the photo scrim `linear-gradient(180deg, #0000 30%, #00000080)`. No other hues.

### Type

One family: Instrument Sans (OFL, `next/font/google`). It has tabular figures (`tnum`), so every number on a money screen lines up.

| Style | Size / line-height | Weight | Tracking | Color |
|---|---|---|---|---|
| Display (landing H1) | 72/76, mobile 40/44 | 500 | -0.02em | ink |
| H2 (landing sections) | 56/59, mobile 34/38 | 500 | -0.015em | ink |
| H3 (cards) | 36/41, mobile 26/30 | 500 | -0.01em | ink |
| App title | 28/32 | 500 | -0.01em | ink |
| Amount (borrow input, big numbers) | 56/60, mobile 44/48 | 500 | -0.02em, tnum | ink |
| H4 | 20/26 | 500 | 0 | ink |
| Eyebrow | 14/14 | 500 | 0.1em, uppercase | `#333333` |
| Body large | 20/30 | 500 | 0 | body |
| Body | 16/24 | 500 | 0 | body |
| Helper | 14/20 | 500 | 0 | muted |
| Number (rows) | 16/24 | 500 | tnum | ink |
| Code (tx hash, address, JSON) | 13/20 IBM Plex Mono 400 | | | ink |

No bold anywhere. Weight 500 only. Apply `font-variant-numeric: tabular-nums` to every number.

### Shape, space, depth

- Radius: pills 99px, landing cards 36px, app panels 24px, inputs 16px, images 36px inside cards, sheet top corners 60px (mobile 32px).
- Spacing: 4, 8, 12, 16, 24, 32, 48, 64, 96, 160.
- Landing container 1224px, app column 480px.
- One shadow, only on floating product renders: `0 0 60px -13px #0000001f`. Nothing else has a shadow.
- Breakpoints: 991, 767, 479.

### Motion

- 150ms ease-out on hover and press, 200ms fade on step status change. No scroll animation, no parallax.
- The held share counter never animates its value.
- `prefers-reduced-motion` turns off the skeleton pulse and all transitions.

## 3. Brand assets

- Mark: the cradle. A rounded lowercase "l" (5/32 stroke, round caps) whose foot curves into a base, holding a solid coin that rests in the corner. The coin is the share you keep. Stroke in `--ink` (white on dark), coin in `--action`. This is the only place violet appears outside an action.
- Wordmark: lowercase `lendhold`, Instrument Sans 500, letter-spacing -0.02em.
- Lockup: mark left, wordmark right, gap 8px at 24px type.
- Favicon: mark only, drawn on a 32 grid, legible at 16px.
- Tagline: "Borrow against your stocks. Keep them."
- Sponsor line (footer only, text): "Built for BNB Hack: Tokenized Stocks Edition". No sponsor logos or seals unless official assets are supplied.

## 4. Components

| Component | Spec |
|---|---|
| NavBar | Floating glass bar, sticky, 12px from the top and 12px from the sides, 60px tall, max 1224px, radius 30px, padding 24px left and 8px right, `backdrop-filter: blur(12px)`. Fill at 992px and above: `linear-gradient(#0000000d, #0000000d), linear-gradient(#ffffffde, #ffffff80), #0000000d`. Below 992px: `linear-gradient(#f0f0f0cc, #f0f0f066), #0000000d`. The hero slides under it. Logo left. Links centered on the bar (How it works, Proof, For agents, FAQ): 14px, weight 500, padding 16x24, pill radius, `--body` text, 4px apart. Hover: white pill with ink text. Press: scale 0.95. Right: primary pill "Open app" (48px tall). Collapses at 991px: logo and a 44px menu button (Menu and X icons, 24px). The menu is a fixed panel 84px from the top, 12px from the sides, radius 30px, padding 12px, blur 12px, fill `linear-gradient(#f0f0f0cc, #ffffff), #0000000d`. Its links are 16px, padding 20x24, pill radius, white hover, followed by a full-width primary "Open app" pill. Escape, a link click, the CTA and widening past 992px close it. |
| AppBar | Same pill, 64px. Logo left. Right: WalletChip, or primary pill "Connect wallet". |
| PrimaryPill | `--action` fill, `--on-action` text 17px 500, padding 16x28, radius 99. App: full width, 56px tall. Disabled: `#e7e7e7` fill, `#6d6d6d` text. Loading: label kept, 16px spinner on the right. |
| SecondaryPill | White fill on canvas surfaces, canvas fill on white surfaces. Ink text, same size. Never an outline. |
| TextLink | Ink 16px with a trailing arrow, underline on hover. For tertiary navigation only. |
| WalletChip | Canvas pill: 20px wallet icon, short address in Plex Mono, chevron. Menu: copy address, view on BscScan, disconnect. |
| FeatureItem | 48px white circle with a 24px violet Lucide icon, H4, body. No card. |
| ShowcaseCard | Canvas fill, radius 36, padding 48 (mobile 24). Title H3, body large, a pill, then a live product render that bleeds off the bottom edge with the one shadow. |
| PhotoBand | Radius-36 frame, photo `object-fit: cover`, scrim gradient, white H3 and body top-left, white pill. |
| Panel | White on the canvas (app), radius 24, padding 24. |
| AmountInput | Amount style, `$` prefix in muted, numeric keypad, no spinner arrows. Error state: risk text below, never a red border alone. |
| BreakdownRow | Label (body) left, value (Number) right, 1px `--line` divider. |
| HeldCounter | "{shares} NVDA" in Number style plus a `held` tag (`--safe` text on `--safe-tint`, pill). |
| HealthBadge | Pill with SAFE, WATCH or AT RISK (eyebrow style) on the matching tint. |
| CushionRuler | 8px track, risk price tick left, current price marker right, "cushion {x}%" above. Fill uses the health tint. When the market is closed, a hatched segment shows the extra room kept. Computed from plan or position data. Never drawn without real numbers. |
| StepList | Numbered rows: label, status text, icon (circle, spinner, check in safe, cross in risk), TxLink once a hash exists. |
| TxLink | Plex Mono short hash with an external-link icon, opens `https://bscscan.com/tx/{hash}`. |
| Notice | Panel-style row with an icon: info (canvas), watch (watch tint), risk (risk tint). One or two sentences, plus an optional pill. |
| Sheet | Bottom sheet on mobile, centered 480px modal on desktop, overlay `#00000033`. |
| Skeleton | Canvas blocks at the final height of the content they replace. |
| FAQItem | Canvas fill, radius 24, 20px question, chevron, answer 17px body. |
| Footer | `#1f1f1f`, white links, `#b0b0b0` legal text. |

Icons: Lucide, 20px (24px in feature circles), stroke 1.75.

## 5. Routes and screens

| Route | Screen |
|---|---|
| `/` | Landing |
| `/app` | Connect and holdings |
| `/app/borrow/[token]` | Borrow amount |
| `/app/review/[planId]` | Review |
| `/app/run/[runId]` | Progress and success |
| `/app/loan/[marketId]` | Loan home and repay |
| `/app/buy/[token]` | Buy a stock with USDT |
| `/runs` | Public run history with tx links |
| `/skill` | For agents |
| `/agent` | Operator console (agent path, token-gated) |

`{...}` marks live data.

### 5.1 Landing `/`

**N. Nav.** As NavBar. "Open app" goes to `/app`.

**1. Hero.** Surface: canvas.
```
                Borrow against your stocks.
                        Keep them.
     Get dollars on BNB Chain against the tokenized US stocks
     you hold. You keep the shares, and you see the price where
         risk starts before you sign anything.
        [ See what you can borrow ]   ( How it works )
   NVIDIA {price} · US market {open|closed} · safe to borrow {pct}% of its value
   [ live product cluster ]
```
- Primary goes to `/app`. The secondary white pill scrolls to How it works.
- The live strip reads the market status (price, session) and the market list (LLTV). Safe % = LLTV x 60% when open, x 45% when closed. The strip is hidden if either call fails.
- Product cluster, three live renders, each hidden on its own if its data fails:
  1. Phone frame: the Borrow screen for "Example: 1 NVIDIA share at today's price", computed from the same live values. The label says "Example" on screen.
  2. Wide panel: the most recent confirmed mainnet run with its StepList and real tx hashes.
  3. Code panel: that run's plan as JSON (`action`, `steps[].kind`, `to`, `selector`, `display.sharesAfter`), titled "What your agent sees".

**2. Three points.** Canvas surface, 3 FeatureItems.

| Icon | Title | Body |
|---|---|---|
| `shield-check` | Keep your shares | Borrow against bStocks directly. Your share count stays the same. |
| `gauge` | See the risk first | The price where your stock is at risk is on every screen, before you confirm. |
| `link` | Checked on BNB Chain | A step only counts as done after we confirm it on-chain. |

**3. How it works.** A white sheet begins here with 60px top corners. Eyebrow "HOW IT WORKS", H2 "Cash today. Your stocks stay yours."
- ShowcaseCard, full width, "Borrow against bStocks". Body: "Pick a stock you hold, choose an amount inside the safe line, and get USDT. Loans come from Lista Lending on BNB Chain." Pill "See what you can borrow" goes to `/app`. Render: live Review panel for the 1-share example (You keep, You get, You owe, Interest, Risk price).
- ShowcaseCard, half, "Hold Ondo tokens?". Body: "We convert them to the matching bStock first and show the exact share cost before you confirm." Pill "Check my wallet" goes to `/app`. Render: live conversion line for 1 NVDAon ("1.0000 shares become {n} shares, {c}% cost"), from the convert-quote endpoint. Hidden when the Ondo market is closed. The body copy stays.
- ShowcaseCard, half, "Use it from your AI agent". Body: "Your Binance Agentic Wallet can run the same plan. It shows every step and waits for your yes." Pill "Set up your agent" goes to `/skill`. Render: the latest agent run's steps with tx links.

**4. Who it's for.** PhotoBand with a laptop-and-numbers photo. H3 "Stock money for your business, without selling the stock". Body "Borrow what you need now. Repay when sales come in." White pill "See what you can borrow".

**5. The risk.** Eyebrow "THE RISK", H2 "Know the risk price before you sign". Two columns:
- Left: "If NVIDIA falls to the risk price, part of your stock is sold to repay the loan. Lendhold shows that price on every screen, keeps extra room when the US market is closed, and tells you when you're getting close." Then three rows: "Safe amount: {pct}% of your stock's value right now". "Minimum loan: {minLoan} (set by Lista)". "Interest: {apr}% a year right now". Each row is hidden if its value fails.
- Right: a live CushionRuler for the 1-share example at the safe amount, labeled "Example: 1 NVIDIA share, safe amount".
- Closing line: "We show facts. You decide."

**6. Proof.** Eyebrow "PROOF", H2 "Every run is on BNB Chain". Up to 3 cards (canvas, radius 24) from the run history, confirmed runs only. Each card shows the date, action ("Deposit NVDAB"), a path tag (Browser, Agent or Skill), "{n} transactions confirmed", and a white pill "View on BscScan" (last tx). TextLink "See every run" goes to `/runs`. The section is hidden when there are no confirmed runs.

**7. FAQ.** Eyebrow "QUESTIONS", H2 "Lendhold FAQs", 800px column.

| Question | Answer |
|---|---|
| What is Lendhold? | An app that lets you borrow dollars against tokenized US stocks you hold on BNB Chain. It plans each step, checks it, and shows the result on-chain. |
| Who lends the money? | Lista Lending, a lending protocol on BNB Chain. Lendhold is software. It is not a lender, and your stock sits in Lista's contract, not with us. |
| What happens if my stock falls? | If the price reaches the risk price, part of your stock is sold to repay the loan. You can repay or add stock at any time to move the risk price lower. |
| What does it cost? | Lista's interest, shown before you confirm, plus BNB Chain gas, usually a few cents. Swaps show their exact cost. |
| Is there a minimum? | Yes. Lista's minimum loan is {minLoan}, and Lendhold won't plan a smaller one. |
| Which stocks work? | bStocks directly. Ondo tokens after conversion, while their market is open. xStocks aren't supported on BNB Chain yet. |
| Who can use it? | People outside the US and other restricted regions. The token issuers and Binance set who is eligible. |

**8. Final CTA.** Canvas card, radius 36, two columns. Left: H3 "See what your stocks can borrow", body "Connect your wallet. It takes about a minute to see your safe amount.", primary pill "Open app". Right: a photo at radius 36.

**9. Footer.** Columns:
- Product: Open app, How it works, Proof, For agents.
- Built on: Lista Lending, Binance Web3 Wallet, BNB Chain. These are external links.
- Legal paragraph: "Lendhold is software. It is not a broker, bank or lender, and nothing here is investment advice. Loans are provided by Lista Lending smart contracts on BNB Chain. Tokenized stocks are issued by third parties and are not available to US persons or in restricted regions. Borrowing against assets that can fall in price can lead to liquidation."
- Last line: "Built for BNB Hack: Tokenized Stocks Edition. Photos: Ninthgrid, Microsoft 365 and Daniel Thomas on Unsplash."

### 5.2 App shell (all `/app/*`)

Canvas background, AppBar, 480px column, content in white Panels.
- Not connected: see 5.3.
- Wrong network: full-width Notice (watch) "Lendhold runs on BNB Chain. Switch your wallet to continue." with primary pill "Switch to BNB Chain" (`wallet_switchEthereumChain`, chain 56).
- API down: Notice (risk) "We can't reach Lendhold right now. Your wallet and loans are safe on BNB Chain." with pill "Try again".

### 5.3 Connect `/app`, not connected

```
Panel
  See what you can borrow
  Connect the wallet that holds your stock tokens.
  [ Connect wallet ]
  Works with Binance Wallet and other browser wallets on BNB Chain.
```
The connect sheet lists only the wallets the browser actually has (EIP-6963), Binance Wallet first. With no wallet: "No browser wallet found. Install Binance Wallet, then come back." plus a pill to Binance's official download page. First connect shows the eligibility sheet: "Tokenized stocks aren't available to US persons or in restricted regions." A checkbox "I'm eligible to hold tokenized stocks" enables "Continue". The choice is stored locally.

### 5.4 Home `/app`, connected

```
Your loans                          (hidden when none)
  NVIDIA  NVDAB              [SAFE]
  You owe {debt} {loan}   {shares} shares held   >
Your stocks
  NVIDIA  NVDAB  bStocks
  {shares} shares   {value}        [ Borrow ]
  Apple   AAPLon  Ondo
  {shares} shares   {value}        [ Borrow ]
  Converts to AAPLB first
  AMD  AMDx  xStocks
  {shares} shares   Not supported on BNB Chain yet
```
- Data: the wallet's holdings, and its open Lista positions.
- Rows with a working action get a canvas "Borrow" pill. Unsupported rows get no button at all.
- Empty: "No stock tokens in this wallet yet." Primary pill "Buy NVIDIA with USDT" goes to `/app/buy/NVDAB`, shown only when the wallet holds USDT. With no USDT: "You need USDT on BNB Chain to buy." and no button.
- Loading: 3 skeleton rows at row height.

### 5.5 Borrow `/app/borrow/[token]`

```
< Your stocks
Borrow against NVIDIA
{shares} NVDA held
            ${amount}
Safe up to   {safe}
Most         {max}
Minimum      {minLoan}
[ CushionRuler ]
(i) US market closed until {time}, so we keep extra room.     (when closed)
You receive  [ USDT | USD1 ]                                    (segmented)
[ Review ]
```
- The amount is prefilled with the safe amount, then re-planned 600ms after typing stops. The ruler and rows update.
- Ondo token: under the title, "Your {X}on becomes {X}B first. {a} shares become {b} shares, {c}% conversion cost."
- Above safe: Notice (watch) "Above the safe amount. A {d}% drop in NVIDIA would put your stock at risk." The Review button stays enabled.
- Blocked (above the maximum, below the minimum loan, no market, asset paused and the rest): Review disabled, Notice (risk) with the server message plus what to do next.

### 5.6 Review `/app/review/[planId]`

```
Review
You keep     {shares} NVDA  [held]
You get      {amount} USDT
You owe      {debt} USD1
Interest     {apr}% a year
Risk price   NVIDIA below {price}
  Below this, part of your stock is sold to repay.
Steps
  1 Allow NVDAB       Simulated
  2 Deposit NVDAB     Checked
  3 Borrow USD1       Checked
  4 Swap to USDT      Checked
> Details   market, LLTV, oracle price, contract addresses
Plan valid for {mm:ss}
[ Confirm and borrow ]
```
- Other actions use the same screen with different top rows and button labels (repay, deposit, withdraw, buy).
- "Simulated" means the transaction simulation passed. "Checked" means the precheck passed and the step is simulated again right before sending.
- Expired: the button becomes "Refresh plan" and rebuilds with the same inputs.
- Failed simulation: button disabled, Notice (risk) with the reason.

### 5.7 Run `/app/run/[runId]`

Running:
```
Borrowing
Sign each step in your wallet. Keep this page open.
1 Allow NVDAB      Confirmed   0xab12…  ↗
2 Deposit NVDAB    Confirmed   0xcd34…  ↗
3 Borrow USD1      Waiting for your signature
4 Swap to USDT     Waiting
```
Done:
```
Done
You still hold    {shares} NVDA  [held]
You received      {amount} USDT
You owe           {debt} USD1
Risk price        {price}
[ CushionRuler ]
4 transactions confirmed on BNB Chain
[ View my loan ]
```
- Step statuses: Waiting, Checking, Waiting for your signature, Sent (hash shown, not yet confirmed), Confirmed (server-verified receipt), Failed.
- Cancelled in the wallet: "You cancelled in your wallet. Nothing was sent for this step." Pill "Try again".
- Failed: the reason, plus pill "Try this step again". The page re-reads chain state first and never resends a step that already has a hash.
- Reload mid-run resumes from the server record.
- Agent runs: subtitle "Running on Binance Agentic Wallet", no signature prompts. If the Binance app needs to confirm: "Approve this in your Binance app."

### 5.8 Loan `/app/loan/[marketId]`

```
NVIDIA loan                   [SAFE]
[ CushionRuler ]
Risk starts at   {price}
NVIDIA now       {price}
You owe          {debt} USD1
Interest         {apr}% a year
{shares} NVDA held  [held]
[ Repay ]  ( Add stock )
Withdraw stock  →                    (TextLink)
> Details
```
- Sheets: Repay (amount, "Repay all", the min-loan rule, your balance of the loan token), Add stock (deposit amount, "after this you can safely borrow {n}"), Withdraw (all when there's no debt, otherwise up to the amount that keeps the loan safe). Each sheet builds a plan and opens Review.
- WATCH or AT RISK: the badge changes, Repay stays first, plus the line "Your stock is {x}% above the risk price. Repay some or add stock to stay safe."
- Closed (no debt, no collateral): "This loan is closed." Pill "Back to your stocks".

### 5.9 Buy `/app/buy/[token]`

```
Buy NVIDIA
Pay with USDT on BNB Chain
          ${amount}
You get about   {shares} shares
Cost            {c}%
Your USDT       {balance}
[ Review ]
```
Closed or paused: Notice with the reopen time. Insufficient USDT: Review disabled, "You have {balance} USDT."

### 5.10 Proof `/runs`

Landing chrome (nav and footer), white sheet. H2 "Every run on mainnet". Body: "Each confirmed step below was checked on BNB Chain. It succeeded, came from the wallet shown, and called the contract the plan said." Filter tabs: All, Browser, Agent, Skill (violet active tab). A list of runs, each with date, action, path tag, status, and expandable steps with TxLinks. Failed runs stay listed with their reason. Empty: "No runs yet."

### 5.11 For agents `/skill`

Landing chrome. Split hero: left H2 "Use Lendhold from your AI agent", body "The Lendhold skill lets your own Binance Agentic Wallet borrow against your stocks. Your agent shows you the plan, you say yes, and it runs each step from your wallet." Right: a photo.
Then three numbered steps with copyable code blocks (Plex Mono on canvas):
1. "Install and sign in to the Agentic Wallet": `npm install -g @binance/agentic-wallet`
2. "Add the skills": `npx skills add {public repo URL} --skill lendhold` and `npx skills add https://github.com/binance/binance-skills-hub --skill binance-agentic-wallet`
3. "Point it at Lendhold": `export LENDHOLD_API={deployed URL}`, then ask "Borrow $20 against my NVIDIA bStock".

Then "What your agent can't do": "It never runs a step you didn't confirm. It stops on a risky preview. It can't send your funds to another address." TextLink "See agent runs" goes to `/runs?path=agent`.

### 5.12 Operator `/agent`

AppBar, 480px column. Without a token: a single field "Operator token" and "Continue". With a token:
```
Agent wallet   [CONNECTED]
{0x40F9…550a}   Developer Mode {on}
Left today   {n} swaps   {n} contract calls
Session ends {time}
What do you need?
[ I need $20 without selling my NVIDIA        ]
[ Plan ]
(clarifying question, if any)
Review layout for the plan
Cap {maxUsdPerRun} per run
[ Run on Agentic Wallet ]
StepList, live
```
States: session missing, Developer Mode off, quota out, balance limit. Each is a Notice with the exact fix.

### 5.13 Not found and error

- 404: "This page doesn't exist." Primary pill "Go to your stocks".
- Crash on a run page: "Something went wrong on this page. Your steps are saved. Reload to continue." Pill "Reload".
- Crash elsewhere: "Something went wrong on our side." Pill "Reload".

## 6. Copy rules

- Product screens say "keep your shares", never "keep your tokens". When a conversion changes the token (Ondo to bStock), Review states it with the exact cost: "Your NVDAon becomes NVDAB. 0.1000 shares become 0.0998 shares (0.2% conversion cost)." Borrowing directly against a bStock keeps the share count identical.
- The debt asset is always named as it is: "You owe 200.41 USD1". If a final swap delivers USDT, Review shows both lines: "You get 200.00 USDT" and "You owe USD1".
- The tagline "Borrow against your stocks. Keep them." appears on the landing hero, and the risk explanation sits in its own section further down.
- Sentence case everywhere except the health badges and eyebrows. No em dashes or en dashes in copy.
- Numbers: USD with 2 decimals, shares with 3 decimals, prices with 2 decimals.
- Never say "guaranteed", "risk-free" or "investment advice". Say "We show facts. You decide."
- Errors state what happened and what to do next in one or two sentences.
- No mock data, sample names, placeholder numbers or lorem ipsum. Every number comes from an API field. If data fails to load, the component shows its designed error state or is hidden. It never falls back to a hardcoded value.
- No charts of any kind. There is no verified price history. The CushionRuler is the only visualization, and it is computed from live data.
- No outline or ghost buttons. Primary is violet, secondary is a filled pill, tertiary is a text link.
- Every button does something real. No button is shown without a working action, and nothing reads "coming soon".
- Every screen has loading, empty, error, not-connected and wrong-network states. No blank areas.
- Violet only for actions and active states.

## 7. Accessibility

- Contrast: body and muted text pass WCAG AA on `--canvas` and `--sheet`.
- Every icon-only control has an accessible label.
- Focus ring: 2px `--action` outline, offset 2px.
- Touch targets at least 44px.

## 8. Build order

1. Tokens, fonts, AppBar and NavBar, pills, Notice. Replace the starter page.
2. Positions, market price and run history endpoints. Wallet connect, eligibility sheet, wrong network.
3. Home, Borrow, Review.
4. Run with browser signing: first browser mainnet run (deposit and withdraw, about $3).
5. Loan and its sheets, Buy.
6. Landing, one section at a time in order N, 1 to 9, with the convert-quote and example endpoints.
7. `/runs`, `/skill`, `/agent`, 404 and error.
8. Full pass at 390px and 1440px, every state forced once, copy scan for banned words and em dashes.

Build one screen at a time and check it at 390px and 1440px before starting the next.
