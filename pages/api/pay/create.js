// pages/api/pay/create.js
export const config = { runtime: "nodejs" };

import { randomBytes } from "crypto";
import { URLSearchParams } from "url";
import { getItem, TREASURY, CRUSH_MINT } from "../../../lib/payments";

/**
 * Creates a Solana Pay URL for SPL-token transfer in $CRUSH.
 * We embed a unique memo: crush:<itemId>:<ref> and verify it later.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { wallet, itemId } = req.body || {};
    if (!wallet || !itemId) return res.status(400).json({ error: "wallet & itemId required" });
    if (!TREASURY) return res.status(500).json({ error: "TREASURY_WALLET not set" });

    const item = getItem(itemId);
    if (!item) return res.status(404).json({ error: "Unknown item" });

    // Unique reference token (just a random hex we’ll carry inside memo)
    const ref = randomBytes(16).toString("hex");
    const memo = `crush:${itemId}:${ref}`;

    // Price is in $CRUSH UI units
    const amount = Number(item.priceCrush || 0);
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid price" });

    const params = new URLSearchParams({
      amount: String(amount),
      "spl-token": CRUSH_MINT,
      label: "Crush AI",
      message: `Unlock ${item.title}`,
      memo,
    });

    // solana:<recipient>?amount=...&spl-token=...&label=...&message=...&memo=...
    const url = `solana:${TREASURY}?${params.toString()}`;

    // Private, short caching OK
    res.setHeader("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
    return res.status(200).json({ url, reference: ref });
  } catch (e) {
    return res.status(500).json({ error: "failed", message: String(e?.message || e) });
  }
}
