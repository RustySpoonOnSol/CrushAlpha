// lib/session.js
import crypto from "crypto";

const COOKIE_NAME = "crush_ses";
const SECRET = process.env.SESSION_SECRET || ""; // REQUIRED (>=32 chars recommended)

// base64url helpers
const b64u = (buf) =>
  Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const b64uToBuf = (str) =>
  Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");

// Token: v1.<payloadB64url>.<sigB64url>
// payload = { wallet, iat, exp, v:1 }
export function createSessionToken(wallet, ttlSec = 60 * 60 * 24 * 7) {
  if (!SECRET) throw new Error("SESSION_SECRET not set");
  const now = Math.floor(Date.now() / 1000);
  const payload = { wallet, iat: now, exp: now + ttlSec, v: 1 };
  const payloadB64 = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", SECRET).update(`v1.${payloadB64}`).digest();
  return `v1.${payloadB64}.${b64u(sig)}`;
}

export function verifySessionToken(token) {
  try {
    if (!SECRET || !token || typeof token !== "string") return null;
    const [v, payloadB64, sigB64] = token.split(".");
    if (v !== "v1" || !payloadB64 || !sigB64) return null;

    const expected = crypto.createHmac("sha256", SECRET).update(`v1.${payloadB64}`).digest();
    const given = b64uToBuf(sigB64);
    if (!crypto.timingSafeEqual(expected, given)) return null;

    const payload = JSON.parse(b64uToBuf(payloadB64).toString("utf-8"));
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.wallet || now > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
  );
}
export function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}
export function readSessionCookie(req) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(/;\s*/);
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (k === COOKIE_NAME) return decodeURIComponent(v || "");
  }
  return null;
}
