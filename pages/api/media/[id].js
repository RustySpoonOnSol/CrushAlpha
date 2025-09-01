// pages/api/media/[id].js
export const config = { runtime: "nodejs" };

import fs from "fs";
import path from "path";
import { getItem } from "../../../lib/payments";
import { hasEntitlement } from "../../../lib/entitlements";
import { readSessionCookie, verifySessionToken } from "../../../lib/session";

export default async function handler(req, res) {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ error: "missing id" });

    // ✅ Require a valid signed session (HttpOnly cookie)
    const token = readSessionCookie(req);
    const sess = verifySessionToken(token);
    if (!sess?.wallet) return res.status(401).json({ error: "auth required" });
    const wallet = sess.wallet;

    const item = getItem(id);
    if (!item) return res.status(404).json({ error: "not found" });

    // ✅ Strict entitlement check (no “hold unlocks all” here)
    const entitled = await hasEntitlement(wallet, id);
    if (!entitled) return res.status(403).json({ error: "locked" });

    const filePath = path.join(process.cwd(), "protected", "xenia", "vip", item.file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "missing file" });

    const stat = fs.statSync(filePath);
    res.statusCode = 200;
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", contentTypeFromExt(item.file));
    fs.createReadStream(filePath).pipe(res);
  } catch {
    return res.status(500).json({ error: "failed" });
  }
}

function contentTypeFromExt(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}
