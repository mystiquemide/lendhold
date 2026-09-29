import "server-only";
import { loadConfig, type Config } from "./config.core";

export type { Config } from "./config.core";

let cached: Config | undefined;

export function getConfig(): Config {
  cached ??= loadConfig();
  return cached;
}
