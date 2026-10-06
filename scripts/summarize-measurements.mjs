// Summarizes the swap measurement job into lib/data/swap-costs.json.
// Usage: node scripts/summarize-measurements.mjs <measurements-dir>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/summarize-measurements.mjs <measurements-dir>");
  process.exit(1);
}

const pct = (v, q) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null;
};
const round = (n) => (n === null ? null : Math.round(n * 100) / 100);

const runs = new Set();
const groups = new Map();
for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
  for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.kind !== "token") continue;
    runs.add(row.runId);
    for (const q of row.quotes) {
      for (const key of [`${row.platformId}|${q.usd}|*`, `${row.platformId}|${q.usd}|${row.ticker}`]) {
        const g = groups.get(key) ?? { quotes: 0, costs: [] };
        g.quotes += 1;
        if (q.roundTripCostPct !== null) g.costs.push(q.roundTripCostPct);
        groups.set(key, g);
      }
    }
  }
}

const rows = [...groups].map(([key, g]) => {
  const [issuer, usd, ticker] = key.split("|");
  return {
    issuer,
    usd: Number(usd),
    ticker: ticker === "*" ? null : ticker,
    quotes: g.quotes,
    routedPct: round((g.costs.length / g.quotes) * 100),
    medianPct: round(pct(g.costs, 0.5)),
    p90Pct: round(pct(g.costs, 0.9)),
  };
});
rows.sort((a, b) => a.issuer.localeCompare(b.issuer) || a.usd - b.usd || (a.ticker ?? "").localeCompare(b.ticker ?? ""));

const ids = [...runs].sort();
const out = { from: ids[0], to: ids.at(-1), runs: ids.length, everyMinutes: 30, rows };
writeFileSync(new URL("../lib/data/swap-costs.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`${ids.length} runs, ${rows.length} rows, ${out.from} to ${out.to}`);
