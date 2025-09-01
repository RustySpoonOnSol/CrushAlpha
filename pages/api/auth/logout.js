// pages/api/auth/logout.js
export const config = { runtime: "nodejs" };

import { clearSessionCookie } from "../../../lib/session";

export default async function handler(_req, res) {
  clearSessionCookie(res);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ok: true });
}
