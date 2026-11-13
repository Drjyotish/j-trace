import { json, route } from "@/lib/http";
import { mode } from "@/lib/config";
import { dbKind, queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async () => {
  const started = Date.now();
  await queryOne("SELECT 1 AS ok");
  return json({ ok: true, mode: mode(), db: await dbKind(), dbMs: Date.now() - started, time: new Date().toISOString() });
});
