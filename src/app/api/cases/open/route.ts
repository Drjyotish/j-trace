import { body, ctxOf, json, ownerCookie, route } from "@/lib/http";
import { openCase } from "@/lib/services/owner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/cases/open — re-open a case on another device with reference + secret key. */
export const POST = route(async (req) => {
  const { ref, accessKey } = await body<{ ref: string; accessKey: string }>(req);
  const c = await openCase(String(ref ?? ""), String(accessKey ?? ""), ctxOf(req));
  return json({ ref: c.ref }, { cookies: [await ownerCookie(c.id)] });
});
