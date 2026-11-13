import { body, ctxOf, json, ownerCookie, route } from "@/lib/http";
import { createCase, type CreateCaseInput } from "@/lib/services/owner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/cases — start a recovery case. Returns the reference and a one-time secret key. */
export const POST = route(async (req) => {
  const input = await body<CreateCaseInput>(req);
  const created = await createCase(input, ctxOf(req));
  return json({ ref: created.ref, accessKey: created.accessKey }, { status: 201, cookies: [await ownerCookie(created.id)] });
});
