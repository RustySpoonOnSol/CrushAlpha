// pages/api/auth/me.js
export const config = { runtime: "nodejs" };

import { readSessionCookie, verifySessionToken } from "../../../lib/session";

export default async function handler(req, res) {
  try {
    const token = readSessionCookie(req);
    const payload = verifySessionToken(token);
    res.setHeader("Cache-Control", "no-store");
    if (!payload) return res.status(200).json({ authed: false });
    return res.status(200).json({ authed: true, wallet: payload.wallet, exp: payload.exp });
  } catch {
    return res.status(200).json({ authed: false });
  }
}
