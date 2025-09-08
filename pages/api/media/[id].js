// pages/api/media/[id].js
export const config = { runtime: "nodejs" };

import fs from "fs";
import path from "path";
import { getItem, CRUSH_MINT } from "../../../lib/payments";
import { hasEntitlement } from "../../../lib/entitlements";
import { readSessionCookie, verifySessionToken } from "../../../lib/session";

/** Optional: big holders can view without purchasing */
const NSFW_HOLD = Number(process.env.NEXT_PUBLIC_NSFW_HOLD ?? "2000");

// Light RPC helper (reuse envs if present)
const HELIUS_KEY = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_KEY || "";
const RPCS = [
  process.env.SOLANA_RPC_PRIMARY,
  process.env.SOLANA_RPC_FALLBACK,
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

async function fetchWithTimeout(url, init = {}, ms = 8000) {
  return Promise.race([fetch(url, init), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}
async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  for (const endpoint of RPCS) {
    try {
      const r = await fetchWithTimeout(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body }, 8000);
      const j = await r.json();
      if (!j?.error) return j.result;
    } catch {}
  }
  return null;
}
async function getCrushBalance(owner, mint) {
  const res = await rpc("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed" }]);
  let total = 0;
  for (const v of res?.value || []) total += Number(v?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
  return total;
}

export default async function handler(req, res) {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ error: "missing id" });

    // Require a valid signed session
    const token = readSessionCookie(req);
    const sess = verifySessionToken(token);
    if (!sess?.wallet) return res.status(401).json({ error: "auth required" });
    const wallet = sess.wallet;

    const item = getItem(id);
    if (!item) return res.status(404).json({ error: "not found" });

    // Entitlement OR Big holder auto-unlock
    let entitled = false;
    try {
      // purchase unlock
      entitled = await hasEntitlement(wallet, id);
      if (!entitled) {
        // big holder unlock
        const hold = await getCrushBalance(wallet, CRUSH_MINT);
        const need = typeof item.freeIfHold === "number" ? item.freeIfHold : NSFW_HOLD;
        if (hold >= need) entitled = true;
      }
    } catch {}

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
