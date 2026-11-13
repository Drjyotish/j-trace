import { body, ctxOf, json, requireStaff, route } from "@/lib/http";
import { decideReferral } from "@/lib/services/staff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type P = { params: Promise<{ id: string }> };

/** POST /api/staff/referrals/:id — { decision: "accepted" | "declined" } by the receiving jurisdiction. */
export const POST = route<P>(async (req, { params }) => {
  const staff = await requireStaff(req);
  const { id } = await params;
  const { decision } = await body<{ decision: string }>(req);
  await decideReferral(staff, id, String(decision ?? ""), ctxOf(req));
  return json({ ok: true });
});
