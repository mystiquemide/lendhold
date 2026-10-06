import { handle, json } from "@/lib/api";
import { listCatalog } from "@/lib/engine/catalog";

export const dynamic = "force-dynamic";

export const GET = handle(async () => json({ stocks: await listCatalog() }));
