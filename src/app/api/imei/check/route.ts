import { body, clientIp, json, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { checkImei } from "@/lib/imei";
import { limitBy } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/imei/check — format + Luhn check only.
 * It says whether the number is well-formed. It does NOT say anything about
 * the handset, its owner, or whether TRACE has ever seen it.
 */
export const POST = route(async (req) => {
  const rl = limitBy("imeiValidatePerIp", clientIp(req));
  if (!rl.ok) throw tooMany(rl.retryAfterSec);
  const { imei } = await body<{ imei: string }>(req);
  const r = checkImei(String(imei ?? ""));
  return json({ ok: r.ok, problem: r.problem ?? null, tac: r.tac ?? null });
});
