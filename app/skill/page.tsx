import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { AgentPanel } from "@/components/landing/AgentPanel";
import { NAV_CTA, NAV_LINKS } from "@/components/landing/nav-links";
import { CopyBlock } from "@/components/skill/CopyBlock";
import { NavBar } from "@/components/ui/NavBar";
import { TextLink } from "@/components/ui/TextLink";

export const metadata: Metadata = {
  title: "For agents",
  description: "Let your own Binance Agentic Wallet borrow against your stocks with the Lendhold skill.",
};

const REPO_URL = "https://github.com/mystiquemide/lendhold";
/** The configured site URL, else the address this page was opened at. */
async function siteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const steps = (site: string): { title: string; code: string[]; after?: string }[] => [
  { title: "Install and sign in to the Agentic Wallet", code: ["npm install -g @binance/agentic-wallet"] },
  {
    title: "Add the skills",
    code: [
      `npx skills add ${REPO_URL} --skill lendhold`,
      "npx skills add https://github.com/binance/binance-skills-hub --skill binance-agentic-wallet",
    ],
  },
  { title: "Point it at Lendhold", code: [`export LENDHOLD_API=${site}`], after: "Then ask: “Borrow $20 against my NVIDIA bStock”." },
];

const LIMITS = [
  "It never runs a step you didn't confirm.",
  "It stops on a risky preview.",
  "It can't send your funds to another address.",
];

export default async function SkillPage() {
  const site = await siteUrl();
  return (
    <>
      <NavBar links={NAV_LINKS} cta={NAV_CTA} />
      <main id="main" className="bg-sheet">
        <section aria-labelledby="skill-title" className="mx-auto max-w-[1224px] px-5 pt-32 pb-12 md:px-6 md:pt-40 md:pb-20">
          <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
            <div className="flex max-w-[560px] flex-col gap-4">
              <p className="text-sm leading-none uppercase tracking-[0.1em] text-[#333333]">For agents</p>
              <h1
                id="skill-title"
                className="text-balance text-[34px] leading-[38px] tracking-[-0.015em] text-ink md:text-[44px] md:leading-[48px] lg:text-[56px] lg:leading-[1.05]"
              >
                Use Lendhold from your AI agent
              </h1>
              <p className="text-pretty text-base leading-6 text-body md:text-lg md:leading-normal">
                The Lendhold skill lets your own Binance Agentic Wallet borrow against your stocks. Your agent shows you the
                plan, you say yes, and it runs each step from your wallet.
              </p>
            </div>
            <div className="flex overflow-hidden rounded-[32px] bg-canvas pt-7 md:rounded-[36px] md:pt-9">
              <Suspense fallback={null}>
                <AgentPanel />
              </Suspense>
            </div>
          </div>
        </section>

        <section aria-labelledby="setup-title" className="mx-auto max-w-[1224px] px-5 pb-12 md:px-6 md:pb-20">
          <h2 id="setup-title" className="sr-only">
            Set up the skill
          </h2>
          <ol className="flex max-w-[860px] flex-col gap-4">
            {steps(site).map((s, i) => (
              <li key={s.title} className="flex min-w-0 flex-col gap-4 rounded-[32px] border border-line p-6 md:p-7">
                <span className="num flex size-8 items-center justify-center rounded-full bg-canvas text-sm text-ink">{i + 1}</span>
                <h3 className="text-[19px] leading-6 text-ink">{s.title}</h3>
                <div className="flex flex-col gap-2">
                  {s.code.map((c) => (
                    <CopyBlock key={c} code={c} />
                  ))}
                </div>
                {s.after && <p className="text-[15px] leading-6 text-body">{s.after}</p>}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="limits-title" className="mx-auto max-w-[1224px] px-5 pb-16 md:px-6 md:pb-24">
          <div className="flex flex-col gap-6 rounded-[32px] bg-canvas p-6 md:rounded-[36px] md:p-9">
            <h2 id="limits-title" className="text-[26px] leading-8 tracking-[-0.01em] text-ink md:text-[32px] md:leading-[38px]">
              What your agent can&apos;t do
            </h2>
            <ul className="grid gap-3 md:grid-cols-3">
              {LIMITS.map((l) => (
                <li key={l} className="rounded-2xl bg-sheet p-5 text-base leading-6 text-ink">
                  {l}
                </li>
              ))}
            </ul>
            <TextLink href="/proof" className="self-start">
              See agent runs
            </TextLink>
          </div>
        </section>
      </main>
    </>
  );
}
