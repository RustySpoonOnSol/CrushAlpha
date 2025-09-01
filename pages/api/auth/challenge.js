// pages/api/auth/challenge.js
export const config = { runtime: "nodejs" };

import crypto from "crypto";

export default async function handler(req, res) {
  try {
    const wallet = String(req.query.wallet || req.body?.wallet || "").trim();
    if (!wallet || wallet.length < 25) return res.status(400).json({ error: "wallet required" });

    const ts = Date.now();
    const nonce = crypto.randomBytes(16).toString("hex");

    const message =
`CrushAI Sign-In
Wallet: ${wallet}
Nonce: ${nonce}
TS: ${ts}`;

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ wallet, nonce, ts, message });
  } catch {
    return res.status(500).json({ error: "failed" });
  }
}
