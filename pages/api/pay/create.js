// pages/api/pay/create.js
export const config = { runtime: "nodejs" };

import nacl from "tweetnacl";
import bs58 from "bs58";
import { getItem, isBundle, getBundle, CRUSH_MINT } from "../../../lib/payments";

/**
 * ENV (server):
 * - PAY_RECEIVER or NEXT_PUBLIC_TREASURY   (treasury public key)  ✅ required
 * - BRAND_LABEL (optional, default "Crush AI")
 */

const RECEIVER =
  process.env.PAY_RECEIVER || process.env.NEXT_PUBLIC_TREASURY || "";

const BRAND_LABEL = process.env.BRAND_LABEL || "Crush AI";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { wallet, itemId, ref } = req.body || {};
    if (!wallet || String(wallet).length < 25) {
      return res.status(400).json({ error: "wallet missing/invalid" });
    }
    if (!itemId) {
      return res.status(400).json({ error: "itemId required" });
    }
    if (!RECEIVER) {
      return res.status(400).json({ error: "PAY_RECEIVER not set in env" });
    }
    if (!CRUSH_MINT) {
      return res.status(400).json({ error: "NEXT_PUBLIC_CRUSH_MINT not set" });
    }

    // Resolve product/price
    let title = "";
    let priceCrush = 0;

    if (isBundle(itemId)) {
      const b = getBundle(itemId);
      if (!b) return res.status(400).json({ error: "unknown bundle" });
      title = b.title;
      priceCrush = Number(b.priceCrush || 0);
    } else {
      const item = getItem(itemId);
      if (!item) return res.status(400).json({ error: "unknown item" });
      title = item.title || itemId;
      priceCrush = Number(item.priceCrush || 0);
    }

    if (priceCrush <= 0) {
      return res.status(400).json({ error: "invalid price" });
    }

    // Generate a reference pubkey (Solana Pay reference account)
    const kp = nacl.sign.keyPair();
    const reference = bs58.encode(kp.publicKey);

    // Build Solana Pay URL (SPL token transfer)
    const params = new URLSearchParams({
      amount: String(priceCrush), // UI units; verification re-checks raw using mint decimals
      "spl-token": CRUSH_MINT,
      reference,
      label: BRAND_LABEL,
      message: `Unlock ${title}`,
      memo: `crush:${itemId}${ref ? `:ref=${encodeURIComponent(ref)}` : ""}`,
    });

    const payUrl = `solana:${RECEIVER}?${params.toString()}`;

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      url: payUrl,
      reference,
      receiver: RECEIVER,
      mint: CRUSH_MINT,
      priceCrush,
      label: BRAND_LABEL,
    });
  } catch (_e) {
    return res.status(500).json({ error: "internal_error" });
  }
}
