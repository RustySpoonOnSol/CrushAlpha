// pages/api/media/[id].js

// Allow large files and disable body parsing; keep Node runtime.
export const config = {
  api: { bodyParser: false, responseLimit: false },
  runtime: "nodejs",
};

import fs from "fs";
import path from "path";
import { getItem, CRUSH_MINT } from "../../../lib/payments";
import { hasEntitlement } from "../../../lib/entitlements";
import { readSessionCookie, verifySessionToken } from "../../../lib/session";

/** ====== Config / Thresholds ====== */
const NSFW_HOLD = Number(process.env.NEXT_PUBLIC_NSFW_HOLD ?? "2000");

/** ====== RPC rotation (safe fallback) ====== */
const HELIUS_KEY =
  process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_KEY || "";
const RPCS_RAW = [
  process.env.SOLANA_RPC_PRIMARY || "",
  process.env.SOLANA_RPC_FALLBACK || "",
  process.env.NEXT_PUBLIC_SOLANA_RPC || "",
  HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);
const RPCS = RPCS_RAW.length ? RPCS_RAW : ["https://api.mainnet-beta.solana.com"];

/** ====== Tiny rate limiter (in-memory; per instance) ====== */
const RATE = { windowMs: 60_000, max: 40 }; // 40 req / minute per key
const hits = new Map();
function rateLimit(key) {
  const now = Date.now();
  const w = RATE.windowMs;
  const bucket = hits.get(key) || [];
  const fresh = bucket.filter((t) => now - t < w);
  fresh.push(now);
  hits.set(key, fresh);
  return fresh.length <= RATE.max;
}

/** ====== Light RPC helpers ====== */
async function fetchWithTimeout(url, init = {}, ms = 8000) {
  return Promise.race([
    fetch(url, init),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}
async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const headers = { "content-type": "application/json" };
  let lastErr;
  for (const endpoint of RPCS) {
    try {
      const r = await fetchWithTimeout(endpoint, { method: "POST", headers, body }, 8000);
      const j = await r.json();
      if (!j?.error) return j.result;
      lastErr = new Error(j?.error?.message || "rpc error");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all rpcs failed");
}
async function getCrushBalance(owner, mint) {
  try {
    const res = await rpc("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed" }]);
    let total = 0;
    for (const v of res?.value || []) {
      total += Number(v?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
    }
    return total;
  } catch {
    return 0;
  }
}

/** ====== Utils ====== */
function contentTypeFromExt(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  // fallback (animated web media might vary)
  return "application/octet-stream";
}
function safeJoin(baseDir, relative) {
  // prevent traversal and absolute paths
  if (!relative || relative.includes("..") || path.isAbsolute(relative)) return null;
  const p = path.join(baseDir, relative);
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(p);
  if (!resolvedPath.startsWith(resolvedBase)) return null;
  return resolvedPath;
}
function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  // These vary by auth; make responses uncacheable by shared proxies.
  res.setHeader("Vary", "Authorization, Cookie");
}

/** ====== Main handler ====== */
export default async function handler(req, res) {
  try {
    setSecurityHeaders(res);

    // Methods
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return res.status(405).json({ error: "method not allowed" });
    }

    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ error: "missing id" });

    // Read signed session cookie
    const token = readSessionCookie(req);
    const sess = verifySessionToken(token);
    if (!sess?.wallet) return res.status(401).json({ error: "auth required" });
    const wallet = String(sess.wallet);

    // Basic rate limit (per IP + wallet)
    const ip =
      req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    const rlKey = `${ip}:${wallet}`;
    if (!rateLimit(rlKey)) {
      return res.status(429).json({ error: "too many requests" });
    }

    // Lookup media item
    const item = getItem(id); // includes file + optional freeIfHold
    if (!item) return res.status(404).json({ error: "not found" });
    const needHold = typeof item.freeIfHold === "number" ? item.freeIfHold : NSFW_HOLD;

    // Entitlement check: purchase OR big holder
    let entitled = false;
    try {
      entitled = await hasEntitlement(wallet, id);
      if (!entitled) {
        const hold = await getCrushBalance(wallet, CRUSH_MINT);
        if (hold >= needHold) entitled = true;
      }
    } catch {
      // fall through
    }
    if (!entitled) return res.status(403).json({ error: "locked" });

    // File resolution (protected directory)
    const baseDir = path.join(process.cwd(), "protected", "xenia", "vip");
    const safePath = safeJoin(baseDir, item.file);
    if (!safePath || !fs.existsSync(safePath)) {
      return res.status(404).json({ error: "missing file" });
    }

    // Stat + headers
    const stat = fs.statSync(safePath);
    const ctype = contentTypeFromExt(item.file);
    const filename = path.basename(item.file);

    res.statusCode = 200;
    res.setHeader("Content-Type", ctype);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Accept-Ranges", "bytes");

    // HEAD: headers only
    if (req.method === "HEAD") {
      return res.end();
    }

    // Range support
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const size = stat.size;
      // Parse range safely
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
      if (isNaN(start) || isNaN(end) || start > end || end >= size) {
        res.setHeader("Content-Range", `bytes */${size}`);
        return res.status(416).end();
      }
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      res.setHeader("Content-Length", end - start + 1);
      return fs.createReadStream(safePath, { start, end }).pipe(res);
    }

    // Normal full stream
    return fs.createReadStream(safePath).pipe(res);
  } catch (e) {
    // Avoid leaking internals
    try {
      if (!res.headersSent) res.status(500).json({ error: "failed" });
    } catch {}
  }
}
