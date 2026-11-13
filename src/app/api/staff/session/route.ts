import { body, clearStaffCookie, ctxOf, json, requireStaff, route, staffCookie } from "@/lib/http";
import { login } from "@/lib/services/staff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req) => json({ staff: await requireStaff(req) }));

export const POST = route(async (req) => {
  const { email, password } = await body<{ email: string; password: string }>(req);
  const staff = await login(String(email ?? ""), String(password ?? ""), ctxOf(req));
  return json({ staff }, { cookies: [await staffCookie(staff.id)] });
});

export const DELETE = route(async () => json({ ok: true }, { cookies: [clearStaffCookie()] }));
