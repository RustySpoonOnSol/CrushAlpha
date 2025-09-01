// pages/api/pay/create.js
export const config = { runtime: "nodejs" };

import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";
import { getItem } from "../../../lib/payments";

// ENV
const MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";
// Treasury to receive $CRUSH for per-image unlocks
const RECEIVER =
  process.env.PAY_RECEIVER || process.env.NEXT_PUBLIC_TREASURY || "";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { wallet, itemId } = req.body || {};
    if (!wallet || String(wallet).length < 25) {
      return res.status(400).json({ error: "wallet missing/invalid" });
    }
    if (!itemId) {
      return res.status(400).json({ error: "itemId required" });
    }
    if (!RECEIVER) {
      return res.status(400).json({ error: "PAY_RECEIVER not set in env" });
    }
    if (!MINT) {
      return res.status(400).json({ error: "NEXT_PUBLIC_CRUSH_MINT not set" });
    }

    const item = getItem(itemId);
    if (!item?.priceCrush || item.priceCrush <= 0) {
      return res.status(400).json({ error: "unknown item or missing price" });
    }

    // Generate a reference public key (no need to persist)
    const kp = nacl.sign.keyPair(); // 32-byte pubkey
    const reference = bs58.encode(kp.publicKey);

    // Solana Pay transfer URL
    // Spec: solana:<recipient>?amount=...&spl-token=<mint>&reference=<ref>&label=...&message=...&memo=...
    const params = new URLSearchParams({
      amount: String(item.priceCrush), // whole token units; verify uses decimals to be safe
      "spl-token": MINT,
      reference,
      label: "Crush AI",
      message: `Unlock ${itemId}`,
      memo: `crush:${itemId}`,
    });
    const payUrl = `solana:${RECEIVER}?${params.toString()}`;

    // Return to client
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      url: payUrl,
      reference,
      receiver: RECEIVER,
      mint: MINT,
    });
  } catch (e) {
    // Never leak stack in prod
    return res.status(500).json({ error: "internal_error" });
  }
}
