import { body, ctxOf, json, route } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { confirmDevice, confirmImeiRecovery, registerDevice, requestImeiRecovery } from "@/lib/services/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** POST /api/vault — pre-loss device vault: register a handset, or recover its IMEI later. */
export const POST = route(async (req) => {
  const b = await body<any>(req);
  const ctx = ctxOf(req);
  switch (b.action) {
    case "register":
      return json(await registerDevice(b, ctx));
    case "register_confirm":
      return json(await confirmDevice(String(b.requestId ?? ""), String(b.code ?? ""), ctx));
    case "recover":
      return json(await requestImeiRecovery(String(b.phone ?? ""), String(b.country ?? ""), ctx));
    case "recover_confirm":
      return json(await confirmImeiRecovery(String(b.requestId ?? ""), String(b.code ?? ""), ctx));
    default:
      throw new AppError("unknown_action", 400);
  }
});
