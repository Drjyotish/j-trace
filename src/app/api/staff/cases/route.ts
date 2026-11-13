import { json, requireStaff, route } from "@/lib/http";
import { dashboardStats, listCases } from "@/lib/services/staff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/staff/cases — the caller's queue, already filtered by role and jurisdiction. */
export const GET = route(async (req) => {
  const staff = await requireStaff(req);
  return json({ staff, stats: await dashboardStats(staff), cases: await listCases(staff) });
});
