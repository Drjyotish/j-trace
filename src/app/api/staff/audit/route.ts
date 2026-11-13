import { ctxOf, json, requireStaff, route } from "@/lib/http";
import { auditTrail, runRetention } from "@/lib/services/staff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/staff/audit — audit entries plus a full hash-chain verification. */
export const GET = route(async (req) => {
  const staff = await requireStaff(req);
  const caseId = new URL(req.url).searchParams.get("caseId");
  return json(await auditTrail(staff, { caseId }));
});

/** POST /api/staff/audit — run the retention purge now (admin). */
export const POST = route(async (req) => {
  const staff = await requireStaff(req);
  return json(await runRetention(staff, ctxOf(req)));
});
