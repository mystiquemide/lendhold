import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PositionSummary } from "@/lib/engine/positions";

const dir = mkdtempSync(join(tmpdir(), "lendhold-alerts-svc-"));
vi.stubEnv("DATABASE_URL", "");
vi.stubEnv("DATABASE_PATH", join(dir, "alerts.db"));
vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://lendhold.test");

const WALLET = "0xAbf039f2DC31084F5E0713708C96068126a043e9";
const sent: { chatId: string; text: string }[] = [];
let sendFails = false;
let positionsFail = false;
let health: "safe" | "watch" | "at_risk" = "watch";

const position = (): PositionSummary =>
  ({
    marketId: "0xm",
    ticker: "TSLA",
    loanSymbol: "USD1",
    debt: 15n,
    collateral: { shares: 0.1 },
    aprPct: 1,
    risk: { debtUsd: 15, collateralUsd: 24, lltv: 0.75, cushion: 0.17, liquidationPricePerShare: 200, health },
    sizing: { notices: [] },
  }) as unknown as PositionSummary;

vi.mock("@/lib/engine/positions", () => ({
  listPositions: async () => {
    if (positionsFail) throw new Error("rpc down");
    return [position()];
  },
}));
vi.mock("@/lib/alerts/telegram", () => ({
  telegramConfigured: () => true,
  sendTelegram: async (chatId: string, text: string) => {
    if (sendFails) throw new Error("telegram 500");
    sent.push({ chatId, text });
  },
}));

const { runAlertCheck } = await import("@/lib/alerts/service");
const { replyTo } = await import("@/lib/alerts/commands");
const { addWatch, listWatches, MAX_WATCHES_PER_CHAT } = await import("@/lib/store/alerts");

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

beforeEach(() => {
  sent.length = 0;
  sendFails = false;
  positionsFail = false;
  health = "watch";
});

describe("bot commands", () => {
  it("/start with a wallet watches it and replies with its loans", async () => {
    const reply = await replyTo("100", `/start ${WALLET}`);
    expect(reply).toMatch(/^Watching 0xAbf0…43e9/);
    expect(reply).toContain("TSLA: Watch, owe 15.00 USD1");
    expect(reply).toContain("https://lendhold.test/app/loan/0xm");
    expect(await listWatches("100")).toEqual([{ chatId: "100", address: WALLET.toLowerCase() }]);
  });

  it("/watch without a valid address explains the format, plain /start shows help", async () => {
    expect(await replyTo("101", "/watch")).toMatch(/followed by your BNB Chain wallet address/);
    expect(await replyTo("101", "/watch 0x1234")).toMatch(/followed by your BNB Chain wallet address/);
    expect(await replyTo("101", "/start")).toMatch(/^Lendhold sends a message/);
    expect(await replyTo("101", "hello")).toMatch(/^Lendhold sends a message/);
  });

  it("caps watched wallets per chat", async () => {
    for (let i = 0; i < MAX_WATCHES_PER_CHAT; i++) await addWatch("102", `0x${String(i).padStart(40, "0")}`);
    expect(await replyTo("102", `/watch ${WALLET}`)).toMatch(/up to 5 wallets/);
  });

  it("/status lists watched wallets, /unwatch stops them", async () => {
    expect(await replyTo("103", "/status")).toMatch(/No wallets watched yet/);
    await replyTo("103", `/watch ${WALLET}`);
    expect(await replyTo("103", "/status@LendholdBot")).toContain("TSLA: Watch");
    expect(await replyTo("103", "/unwatch 0xnope")).toMatch(/isn't a wallet address/);
    expect(await replyTo("103", "/unwatch")).toBe("Stopped watching 1 wallet.");
    expect(await replyTo("103", "/unwatch")).toBe("Nothing to stop.");
  });
});

describe("runAlertCheck", () => {
  it("alerts each chat once, then stays quiet until health changes", async () => {
    await addWatch("200", WALLET);
    await addWatch("201", WALLET);
    const first = await runAlertCheck();
    const mine = sent.filter((m) => m.chatId === "200" || m.chatId === "201");
    expect(mine).toHaveLength(2);
    expect(mine[0].text).toContain("TSLA loan is now Watch");
    expect(first.errors).toBe(0);

    sent.length = 0;
    await runAlertCheck();
    expect(sent.filter((m) => m.chatId === "200")).toHaveLength(0);

    health = "safe";
    await runAlertCheck();
    expect(sent.find((m) => m.chatId === "200")?.text).toContain("back to Safe");
  });

  it("counts a failed position read as an error and sends nothing", async () => {
    await addWatch("202", WALLET);
    positionsFail = true;
    const r = await runAlertCheck();
    expect(r.errors).toBeGreaterThan(0);
    expect(sent).toHaveLength(0);
  });

  it("does not record an alert that failed to send, so the next run retries it", async () => {
    await addWatch("203", WALLET);
    health = "at_risk";
    sendFails = true;
    const r = await runAlertCheck();
    expect(r.errors).toBeGreaterThan(0);
    sendFails = false;
    await runAlertCheck();
    expect(sent.find((m) => m.chatId === "203")?.text).toContain("now At risk");
  });
});
