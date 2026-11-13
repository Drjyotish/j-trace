import { json, route } from "@/lib/http";
import { isDemo, LIMITS } from "@/lib/config";
import { INTEGRATIONS } from "@/lib/adapters";
import { DEMO_PASSWORD, DEMO_STAFF } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/meta — public facts about this deployment. Demo sign-ins are listed only in demo mode. */
export const GET = route(async () => {
  const demo = isDemo();
  return json({
    demo,
    integrations: INTEGRATIONS,
    retention: { daysAfterClose: LIMITS.retentionDaysAfterClose, daysInactive: LIMITS.retentionDaysInactive },
    demoAccounts: demo ? DEMO_STAFF.map((s) => ({ email: s.email, note: s.note, verified: s.verified })) : [],
    demoPassword: demo ? DEMO_PASSWORD : null,
  });
});
