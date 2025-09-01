// pages/api/auth/verify.js
export const config = { runtime: "nodejs" };

import nacl from "tweetnacl";
import bs58 from "bs58";
import { createSessionToken, setSessionCookie } from "../../../lib/session";

const enc = (s) => new TextEncoder().encode(s);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }
    const { wallet, signatureBase64, nonce, ts } = req.body || {};
    if (!wallet || !signatureBase64 || !nonce || !ts)
      return res.status(400).json({ error: "missing fields" });

    const message =
`CrushAI Sign-In
Wallet: ${wallet}
Nonce: ${nonce}
TS: ${ts}`;

    const skew = Math.abs(Date.now() - Number(ts));
    if (!Number.isFinite(skew) || skew > 10 * 60 * 1000) return res.status(400).json({ error: "stale challenge" });

    const pub = bs58.decode(wallet);
    const sig = Buffer.from(signatureBase64, "base64");
    const ok = nacl.sign.detached.verify(enc(message), sig, pub);
    if (!ok) return res.status(401).json({ error: "bad signature" });

    const token = createSessionToken(wallet);
    setSessionCookie(res, token);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, wallet });
  } catch (e) {
    return res.status(500).json({ error: "failed", message: String(e?.message || e) });
  }
}
