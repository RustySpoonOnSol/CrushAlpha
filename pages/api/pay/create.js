// pages/api/pay/create.js
export const config = { runtime: "nodejs" };

import nacl from "tweetnacl";
import bs58 from "bs58";
import { kv } from "@vercel/kv";
import { getItem, isBundle, getBundle, CRUSH_MINT } from "../../../lib/payments";

const RECEIVER = process.env.PAY_RECEIVER || process.env.NEXT_PUBLIC_TREASURY || "";
const BRAND_LABEL = process.env.BRAND_LABEL || "Crush AI";

function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { wallet, itemId, ref } = req.body || {};
    if (!wallet || String(wallet).length < 25) return res.status(400).json({ error: "wallet missing/invalid" });
    if (!itemId) return res.status(400).json({ error: "itemId required" });
    if (!RECEIVER) return res.status(400).json({ error: "PAY_RECEIVER not set in env" });
    if (!CRUSH_MINT) return res.status(400).json({ error: "NEXT_PUBLIC_CRUSH_MINT not set" });

    // Resolve product/price
    let title = "", priceCrush = 0;
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
    if (priceCrush <= 0) return res.status(400).json({ error: "invalid price" });

    // Unique reference public key
    const kp = nacl.sign.keyPair();
    const reference = bs58.encode(kp.publicKey);

    // Memo ties the tx to this item; keep attribution if present
    const memo = `crush:${itemId}${ref ? `:ref=${encodeURIComponent(ref)}` : ""}`;

    const params = new URLSearchParams({
      amount: String(Math.trunc(priceCrush)),
      "spl-token": CRUSH_MINT,
      reference,
      label: BRAND_LABEL,
      message: `Unlock ${title}`,
      memo,
    });

    const solanaUrl    = `solana:${RECEIVER}?${params.toString()}`;
    const universalUrl = `https://phantom.app/ul/v1/solana-pay?recipient=${RECEIVER}&${params.toString()}`;

    // Bind this reference to expected item for 15 minutes (anti-spoof)
    await kv.set(`pay:ref:${reference}`, { itemId }, { ex: 900 });

    noStore(res);
    return res.status(200).json({
      ok: true,
      url: solanaUrl,
      universalUrl,
      reference,
      receiver: RECEIVER,
      mint: CRUSH_MINT,
      priceCrush: Math.trunc(priceCrush),
      label: BRAND_LABEL,
    });
  } catch (e) {
    // minimal one-time log if you need to see why a 500 happened in Vercel logs
    try { console.error("pay/create error:", e); } catch {}
    noStore(res);
    return res.status(500).json({ error: "internal_error" });
  }
}
