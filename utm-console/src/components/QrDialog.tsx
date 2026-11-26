"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { LinkRow } from "@/lib/types";
import { displayUrl, isShortOutdated, kebab } from "@/lib/utm";
import type { Ctx } from "./Console";
import { Modal } from "./ui";

export function QrDialog({ ctx, row, onClose }: { ctx: Ctx; row: LinkRow; onClose: () => void }) {
  const long = ctx.longOf(row);
  const useShort = row.short_url && !isShortOutdated(row, long);
  const target = useShort ? row.short_url! : long;
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    QRCode.toDataURL(target, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#14232a", light: "#ffffff" } })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [target]);

  const name = kebab(`${row.post_date}-${row.platform}-${row.channel}-${row.type}-${row.tag}`);

  return (
    <Modal title="QR code" sub={`${row.type} · ${row.platform} · ${row.channel}`} onClose={onClose}
      footer={src ? <a className="btn primary" href={src} download={`${name}.png`}>Download PNG</a> : null}>
      {src ? <img className="qr" src={src} alt={`QR code for ${target}`} /> : <p className="muted">Generating…</p>}
      <p className="mono small center-text">{displayUrl(target)}</p>
      {!useShort && <p className="small muted center-text">Encodes the long link. Shorten it first for a simpler, scannable code you can re-point later.</p>}
    </Modal>
  );
}
