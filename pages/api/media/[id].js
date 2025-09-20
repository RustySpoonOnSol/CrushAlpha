// pages/api/media/[id].js
// Streams protected media after auth + entitlement. Preserves your original behavior
// (rate limit, CRUSH holder bypass, range support, protected folder), but adds:
// 1) session fallback via /api/auth/me, and
// 2) entitlement fallback via Supabase (item_id or itemId).
//
// Add ?debug=1 to see exact reason when blocked.

export const config = {
  api: { bodyParser: false, responseLimit: false },
  runtime: "nodejs",
};

import fs from "fs";
import path from "path";
import { getItem, CRUSH_MINT } from "../../../lib/payments";
import { hasEntitlement } from "../../../lib/entitlements";
import { readSessionCookie, verifySessionToken } from "../../../lib/session";

/** ====== Env / Config ====== */
const NSFW_HOLD = Number(process.env.NEXT_PUBLIC_NSFW_HOLD ?? "2000");

// Supabase fallback (server-side upsert/verify already writes here)
const SUPA_URL = process.env.SUPABASE_URL || "";
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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
  return "application/octet-stream";
}
function safeJoin(baseDir, relative) {
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
  res.setHeader("Vary", "Authorization, Cookie");
}

/** ====== Fallbacks ====== */
// 1) Session fallback via /api/auth/me (same cookies)
async function getSessionFromMe(req) {
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    const meUrl = `${proto}://${host}/api/auth/me`;
    const r = await fetch(meUrl, {
      headers: {
        cookie: req.headers.cookie || "",
        "x-forwarded-for": req.headers["x-forwarded-for"] || "",
        "user-agent": req.headers["user-agent"] || "",
      },
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    if (j?.authed && j?.wallet) return { wallet: j.wallet };
    return null;
  } catch {
    return null;
  }
}

// 2) Entitlement fallback via Supabase REST (supports item_id or itemId)
async function hasEntitlementViaSupabase(wallet, itemId) {
  if (!SUPA_URL || !SUPA_KEY) return false;
  try {
    const headers = {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
    };
    const q1 = `${SUPA_URL}/rest/v1/entitlements?select=item_id&wallet=eq.${encodeURIComponent(wallet)}&item_id=eq.${encodeURIComponent(itemId)}`;
    const r1 = await fetch(q1, { headers });
    if (r1.ok) {
      const rows = await r1.json();
      if (Array.isArray(rows) && rows.length > 0) return true;
    }
    // try camelCase column (if some rows were inserted that way)
    const q2 = `${SUPA_URL}/rest/v1/entitlements?select=itemId&wallet=eq.${encodeURIComponent(wallet)}&itemId=eq.${encodeURIComponent(itemId)}`;
    const r2 = await fetch(q2, { headers });
    if (r2.ok) {
      const rows = await r2.json();
      if (Array.isArray(rows) && rows.length > 0) return true;
    }
  } catch {}
  return false;
}

/** ====== Main handler ====== */
export default async function handler(req, res) {
  try {
    setSecurityHeaders(res);

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return res.status(405).json({ error: "method not allowed" });
    }

    const id = String(req.query.id || "").trim();
    const debug = req.query.debug != null;
    if (!id) return res.status(400).json({ error: "missing id" });

    // Session (primary: cookie token; fallback: /api/auth/me)
    let wallet = "";
    try {
      const token = readSessionCookie(req);
      const sess = verifySessionToken(token);
      if (sess?.wallet) wallet = String(sess.wallet);
    } catch {}
    if (!wallet) {
      const me = await getSessionFromMe(req);
      if (me?.wallet) wallet = String(me.wallet);
    }
    if (!wallet) {
      return res.status(401).json(debug ? { error: "auth required (no session)" } : { error: "locked" });
    }

    // Rate limit (IP + wallet)
    const ip =
      req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    if (!rateLimit(`${ip}:${wallet}`)) return res.status(429).json({ error: "too many requests" });

    // Lookup media meta
    const item = getItem(id); // your lib returns { file, freeIfHold? }
    if (!item) return res.status(404).json({ error: "not found" });
    const needHold = typeof item.freeIfHold === "number" ? item.freeIfHold : NSFW_HOLD;

    // Entitlement: purchase OR large holder
    let entitled = false;

    // a) app's own entitlement check
    try { entitled = await hasEntitlement(wallet, id); } catch {}

    // b) Supabase fallback (covers column name mismatches / delayed grants)
    if (!entitled) {
      try { entitled = await hasEntitlementViaSupabase(wallet, id); } catch {}
    }

    // c) Holder bypass (RPC)
    if (!entitled) {
      try {
        const hold = await getCrushBalance(wallet, CRUSH_MINT);
        if (hold >= needHold) entitled = true;
      } catch {}
    }

    if (!entitled) {
      return res
        .status(403)
        .json(debug ? { error: "no entitlement", wallet, itemId: id } : { error: "locked" });
    }

    // Resolve file under /protected/xenia/vip (same as your original)
    const baseDir = path.join(process.cwd(), "protected", "xenia", "vip");
    const safePath = safeJoin(baseDir, item.file);
    if (!safePath || !fs.existsSync(safePath)) {
      return res.status(404).json({ error: "missing file" });
    }

    // Headers
    const stat = fs.statSync(safePath);
    const ctype = contentTypeFromExt(item.file);
    const filename = path.basename(item.file);

    res.setHeader("Content-Type", ctype);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    // HEAD: headers only
    if (req.method === "HEAD") {
      res.setHeader("Content-Length", stat.size);
      return res.status(200).end();
    }

    // Byte range support
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const size = stat.size;
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

    // Full stream
    res.setHeader("Content-Length", stat.size);
    return fs.createReadStream(safePath).pipe(res);
  } catch {
    if (!res.headersSent) return res.status(500).json({ error: "failed" });
  }
}
