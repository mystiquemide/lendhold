import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const requiredString = (key: string) =>
  z
    .string({ error: `Missing required environment variable ${key}` })
    .trim()
    .min(1, `Missing required environment variable ${key}`);

const withDefault = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : fallback));

const schema = z.object({
  BINANCE_WEB3_API_KEY: requiredString("BINANCE_WEB3_API_KEY"),
  BINANCE_WEB3_API_SECRET: requiredString("BINANCE_WEB3_API_SECRET"),
  BSC_RPC_URL: withDefault("https://bsc-dataseed.bnbchain.org"),
  LISTA_API_BASE: withDefault("https://api.lista.org"),
  LISTA_MOOLAH_ADDRESS: withDefault(
    "0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C",
  ),
  OPERATOR_TOKEN: optionalString,
  AGENT_MAX_USD_PER_RUN: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : 50),
    z.number().positive("AGENT_MAX_USD_PER_RUN must be a positive number"),
  ),
  BAW_BIN: withDefault("baw"),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: withDefault("gpt-4.1-mini"),
  DATABASE_PATH: withDefault("./data/lendhold.db"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "env";
      return `${key}: ${issue.message}`;
    });
    throw new Error(`Invalid environment configuration. ${problems.join("; ")}`);
  }
  return result.data;
}
