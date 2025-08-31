// pages/api/media/[id].js
export const config = { runtime: "nodejs" };

import fs from "fs";
import path from "path";
import { getItem } from "../../../lib/payments";
import { hasEntitlement } from "../../../lib/entitlements";

// Optional: allow viewing all if wallet holds ≥ NSFW_HOLD
const NSFW_HOLD = Number(process.env.NEXT_PUBLIC_NSFW_HOLD ?? "2000");

const HELIUS = process.env.HELIUS_API_KEY || "";
const RPCS = [
  process.env.SOLANA_RPC_PRIMARY,
  process.env.SOLANA_RPC_FALLBACK,
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  HELIUS ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

const TIMEOUT_MS = 8_000;
const withTimeout = (p, ms = TIMEOUT_MS) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

const MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";

export default async function handler(req, res) {
  try {
    const id = String(req.query.id || "").trim();
    const wallet = String(req.query.wallet || req.headers["x-wallet"] || "").trim();
    if (!id) return res.status(400).json({ error: "missing id" });
    if (!wallet || wallet.length < 25) return res.status(401).json({ error: "wallet required" });

    const item = getItem(id);
    if (!item) return res.status(404).json({ error: "not found" });

    // Allow if entitled OR (optionally) if wallet holds ≥ NSFW_HOLD
    const entitled = await hasEntitlement(wallet, id);
    let allowed = entitled;

    if (!allowed && NSFW_HOLD > 0) {
      const hold = await getCrushBalance(wallet, MINT);
      if (hold >= NSFW_HOLD) allowed = true;
    }

    if (!allowed) return res.status(403).json({ error: "locked" });

    const filePath = path.join(process.cwd(), "protected", "xenia", "vip", item.file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "missing file" });

    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);

    res.statusCode = 200;
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", contentTypeFromExt(item.file));

    stream.pipe(res);
  } catch (e) {
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

async function rpc(method, params) {
  const payload = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  for (const url of RPCS) {
    try {
      const r = await withTimeout(
        fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: payload }),
        TIMEOUT_MS
      );
      const j = await r.json();
      if (!j?.error) return j.result;
    } catch {}
  }
  return null;
}

async function getCrushBalance(owner, mint) {
  const res = await rpc("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed" }]);
  let total = 0;
  for (const v of res?.value || []) {
    total += Number(v?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
  }
  return total;
}
