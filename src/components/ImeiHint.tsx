"use client";

import { checkImei } from "@/lib/imei";
import { useI18n } from "./I18n";

/** Live, on-device IMEI format check (Luhn). Nothing is sent anywhere while typing. */
export function ImeiHint({ value, emptyHint }: { value: string; emptyHint?: string }) {
  const { t } = useI18n();
  if (!value.trim()) return emptyHint ? <span className="hint">{emptyHint}</span> : null;
  const r = checkImei(value);
  if (r.ok) return <span className="hint ok">✓ {t("imei.ok")}</span>;
  return <span className="hint bad">{t(`imei.${r.problem}`)}</span>;
}
