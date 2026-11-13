import { clearOwnerCookie, ctxOf, json, requireOwner, route } from "@/lib/http";
import { eraseCase, ownerView } from "@/lib/services/owner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/case — the signed-in owner's own case. */
export const GET = route(async (req) => {
  const caseId = await requireOwner(req);
  const locale = new URL(req.url).searchParams.get("locale") ?? undefined;
  return json(await ownerView(caseId, locale));
});

/** DELETE /api/case — erase the case and all personal data in it. */
export const DELETE = route(async (req) => {
  const caseId = await requireOwner(req);
  await eraseCase(caseId, ctxOf(req));
  return json({ erased: true }, { cookies: [clearOwnerCookie()] });
});
