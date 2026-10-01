"use client";

import { useState } from "react";
import { Gauge, LoaderCircle, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { TextLink } from "@/components/ui/TextLink";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { Sheet } from "@/components/ui/Sheet";
import { useWallet } from "./WalletProvider";

const STEPS: { Icon: LucideIcon; title: string; body: string }[] = [
  { Icon: Wallet, title: "Connect your wallet", body: "We find the stock tokens you hold on BNB Chain." },
  { Icon: Gauge, title: "See your safe amount", body: "How much you can borrow and the price where risk starts." },
  { Icon: ShieldCheck, title: "Review, then confirm", body: "Every step is checked before your wallet asks you to sign." },
];

const BINANCE_WALLET_URL = "https://www.binance.com/en/web3wallet";

export function ConnectPanel() {
  const w = useWallet();
  const [step, setStep] = useState<"idle" | "eligibility" | "wallets">("idle");
  const [checked, setChecked] = useState(false);

  const start = () => {
    w.clearError();
    setStep(w.eligible ? "wallets" : "eligibility");
  };

  return (
    <>
      <Panel className="flex flex-col items-center gap-7 px-6 py-10 text-center sm:px-10">
        <div className="flex size-16 items-center justify-center rounded-[20px] bg-canvas">
          <LogoMark className="size-9 text-ink" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-[34px] tracking-[-0.01em] text-ink">See what you can borrow</h1>
          <p className="text-base leading-6 text-body">
            Connect the wallet that holds your stock tokens. We&apos;ll show your safe amount in seconds.
          </p>
        </div>
        <ol className="flex w-full flex-col gap-2 text-left">
          {STEPS.map(({ Icon, title, body }, i) => (
            <li key={title} className="flex items-start gap-3 rounded-panel bg-canvas p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sheet text-ink">
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[15px] leading-5 text-ink">
                  <span className="sr-only">Step {i + 1}: </span>
                  {title}
                </p>
                <p className="mt-0.5 text-[13px] leading-5 text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex w-full flex-col items-center gap-4">
          <Pill variant="primary" onClick={start} fullWidth>
            Connect wallet
          </Pill>
          <p className="text-balance text-[13px] leading-5 text-muted">
            <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" className="-mt-0.5 mr-1.5 inline-block" />
            Connecting only reads your balances. Nothing moves without your yes.
          </p>
        </div>
        <div className="flex w-full flex-col items-center gap-3 border-t border-line pt-6">
          <p className="text-[13px] leading-5 text-muted">Works best with</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/binance-wallet.svg" alt="Binance Wallet" width={82} height={24} className="h-6 w-auto" />
          <p className="text-[13px] leading-5 text-muted">and other browser wallets on BNB Chain.</p>
        </div>
      </Panel>
      <p className="mt-6 text-center">
        <TextLink href="/#how-it-works" className="text-[15px]">
          New here? See how it works
        </TextLink>
      </p>

      <Sheet open={step === "eligibility"} onClose={() => setStep("idle")} title="Before you connect">
        <p className="text-base leading-6 text-body">
          Tokenized stocks aren&apos;t available to US persons or in restricted regions.
        </p>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-panel bg-canvas p-4 text-base leading-6 text-ink">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 size-5 shrink-0 accent-[var(--color-action)]"
          />
          I&apos;m eligible to hold tokenized stocks
        </label>
        <Pill
          variant="primary"
          fullWidth
          disabled={!checked}
          className="mt-6"
          onClick={() => {
            w.confirmEligible();
            setStep("wallets");
          }}
        >
          Continue
        </Pill>
      </Sheet>

      <Sheet open={step === "wallets" && !w.address} onClose={() => setStep("idle")} title="Choose a wallet">
        {w.wallets.length === 0 ? (
          <div className="flex flex-col items-start gap-5">
            <p className="text-base leading-6 text-body">No browser wallet found. Install Binance Wallet, then come back.</p>
            <Pill variant="primary" href={BINANCE_WALLET_URL} external fullWidth>
              Get Binance Wallet
            </Pill>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {w.wallets.map((d) => (
              <li key={d.info.uuid}>
                <button
                  type="button"
                  disabled={w.connecting !== null}
                  onClick={() => w.connect(d)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-panel bg-canvas px-4 py-3 text-left text-base leading-6 text-ink transition-colors duration-150 hover:bg-line disabled:cursor-progress"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.info.icon} alt="" width={32} height={32} className="size-8 rounded-lg" />
                  <span className="flex-1">{d.info.name}</span>
                  {w.connecting === d.info.uuid && (
                    <LoaderCircle size={18} strokeWidth={1.75} className="animate-spin text-muted" aria-label="Connecting" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {w.error && (
          <Notice tone="risk" className="mt-4">
            {w.error}
          </Notice>
        )}
      </Sheet>
    </>
  );
}
