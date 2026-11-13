import { body, ctxOf, json, requireStaff, route } from "@/lib/http";
import { AppError } from "@/lib/errors";
import {
  createReferral, getCase, postMessage, resolveDispute, revealPii, reviewEvidence, setStatus, submitNetworkEvent,
} from "@/lib/services/staff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type P = { params: Promise<{ id: string }> };

export const GET = route<P>(async (req, { params }) => {
  const staff = await requireStaff(req);
  const { id } = await params;
  return json(await getCase(staff, id, ctxOf(req)));
});

/* eslint-disable @typescript-eslint/no-explicit-any */
/** POST /api/staff/cases/:id — { action, ...params }. Every action re-checks role and jurisdiction. */
export const POST = route<P>(async (req, { params }) => {
  const staff = await requireStaff(req);
  const { id } = await params;
  const b = await body<any>(req);
  const ctx = ctxOf(req);
  switch (b.action) {
    case "reveal":
      return json(await revealPii(staff, id, String(b.legalBasis ?? ""), ctx));
    case "evidence":
      return json(await reviewEvidence(staff, id, String(b.evidenceId ?? ""), String(b.decision ?? ""), ctx));
    case "status":
      await setStatus(staff, id, String(b.status ?? ""), String(b.note ?? ""), ctx);
      return json({ ok: true });
    case "resolve_dispute":
      await resolveDispute(staff, id, String(b.note ?? ""), ctx);
      return json({ ok: true });
    case "refer":
      return json(await createReferral(staff, id, { to: String(b.to ?? ""), reason: String(b.reason ?? ""), legalBasis: String(b.legalBasis ?? "") }, ctx), { status: 201 });
    case "message":
      await postMessage(staff, id, String(b.body ?? ""), ctx);
      return json({ ok: true }, { status: 201 });
    case "simulate_event":
      await submitNetworkEvent(staff, id, { kind: String(b.kind ?? ""), country: String(b.country ?? ""), operator: b.operator ? String(b.operator) : undefined }, ctx);
      return json({ ok: true, simulated: true }, { status: 201 });
    default:
      throw new AppError("unknown_action", 400);
  }
});
