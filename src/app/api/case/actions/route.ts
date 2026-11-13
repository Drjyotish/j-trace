import { body, clearOwnerCookie, ctxOf, json, requireOwner, route } from "@/lib/http";
import { AppError } from "@/lib/errors";
import {
  addEvidence, attachImei, complaintDraft, confirmContactOtp, markRecovered, requestContactOtp, setStep,
} from "@/lib/services/owner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** POST /api/case/actions — { action, ...params } on the signed-in owner's case. */
export const POST = route(async (req) => {
  const b = await body<any>(req);
  if (b.action === "signout") return json({ ok: true }, { cookies: [clearOwnerCookie()] });
  const caseId = await requireOwner(req);
  const ctx = ctxOf(req);
  switch (b.action) {
    case "otp_request":
      return json(await requestContactOtp(caseId, ctx));
    case "otp_confirm":
      return json(await confirmContactOtp(caseId, String(b.code ?? ""), ctx));
    case "evidence":
      return json(await addEvidence(caseId, { kind: b.kind, sha256: b.sha256, reference: b.reference, fileName: b.fileName }, ctx));
    case "step":
      await setStep(caseId, String(b.key ?? ""), b.done === true, { requestId: b.requestId });
      return json({ ok: true });
    case "imei":
      return json(await attachImei(caseId, String(b.imei ?? ""), ctx));
    case "recovered":
      await markRecovered(caseId, ctx);
      return json({ ok: true });
    case "complaint":
      return json(await complaintDraft(caseId, b.locale, ctx));
    default:
      throw new AppError("unknown_action", 400);
  }
});
