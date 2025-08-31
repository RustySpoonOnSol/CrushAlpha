// pages/api/entitlements.js
export const config = { runtime: "nodejs" };

import { listEntitlements } from "../../lib/entitlements";

/**
 * Lists all entitled item IDs for a wallet.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }
    const wallet = String(req.query.wallet || "").trim();
    if (!wallet || wallet.length < 25) return res.status(400).json({ error: "wallet required" });

    const items = await listEntitlements(wallet);

    // Private cache is fine (per-wallet)
    res.setHeader("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
    return res.status(200).json({ wallet, items });
  } catch (e) {
    return res.status(500).json({ error: "failed", message: String(e?.message || e) });
  }
}
