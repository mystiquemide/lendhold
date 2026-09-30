import type { ShowcasePlan } from "@/lib/store/db";
import { shortHex } from "./format";

type Tone = "key" | "value" | "punct";
type Token = [string, Tone];

const toneClass: Record<Tone, string> = { key: "text-ink", value: "text-body", punct: "text-muted" };

function shares(n: number | null): string {
  return n === null ? "null" : String(Number(n.toFixed(4)));
}

function str(value: string | null): Token[] {
  if (value === null) return [["null", "value"]];
  const text = /^0x[0-9a-fA-F]{40}$/.test(value) ? shortHex(value) : value;
  return [[`"${text}"`, "value"]];
}

export function planLines(plan: ShowcasePlan): Token[][] {
  const lines: Token[][] = [[["{", "punct"]]];
  const kv = (indent: number, key: string, value: Token[], comma = true): Token[] => [
    [" ".repeat(indent) + `"${key}"`, "key"],
    [": ", "punct"],
    ...value,
    ...(comma ? ([[",", "punct"]] as Token[]) : []),
  ];
  lines.push(kv(2, "action", str(plan.action)));
  lines.push([['  "steps"', "key"], [": [", "punct"]]);
  plan.steps.forEach((step, i) => {
    lines.push([["    {", "punct"]]);
    lines.push(kv(6, "kind", str(step.kind)));
    lines.push(kv(6, "to", str(step.to)));
    lines.push(kv(6, "selector", str(step.selector), false));
    lines.push([[i === plan.steps.length - 1 ? "    }" : "    },", "punct"]]);
  });
  lines.push([["  ],", "punct"]]);
  lines.push([['  "display"', "key"], [": {", "punct"]]);
  lines.push(kv(4, "sharesBefore", [[shares(plan.display.sharesBefore), "value"]]));
  lines.push(kv(4, "sharesAfter", [[shares(plan.display.sharesAfter), "value"]], false));
  lines.push([["  }", "punct"]]);
  lines.push([["}", "punct"]]);
  return lines;
}

export function CodePanel({ plan }: { plan: ShowcasePlan }) {
  const lines = planLines(plan);
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-line bg-sheet shadow-float md:z-10 md:absolute md:right-0 md:top-0 md:block md:h-[196px] md:w-[400px]">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="size-2 rounded-full bg-line" />
        <span className="size-2 rounded-full bg-line" />
        <span className="size-2 rounded-full bg-line" />
        <span className="ml-2 text-[13px] leading-5 text-muted">What your agent sees</span>
      </div>
      <pre className="overflow-hidden px-4 pb-4 font-mono text-[13px] leading-5">
        {lines.map((tokens, i) => (
          <div key={i} className="flex whitespace-pre">
            <span aria-hidden="true" className="mr-3 w-6 shrink-0 select-none text-right text-muted">
              {i + 1}
            </span>
            <code>
              {tokens.map(([text, tone], j) => (
                <span key={j} className={toneClass[tone]}>
                  {text}
                </span>
              ))}
            </code>
          </div>
        ))}
      </pre>
    </div>
  );
}
