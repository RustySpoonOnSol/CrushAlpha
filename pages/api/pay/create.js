// pages/api/pay/create.js
export const config = { runtime: "nodejs" };

import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import { kv } from "@vercel/kv";

function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
}

const RECEIVER = process.env.PAY_RECEIVER || process.env.NEXT_PUBLIC_TREASURY || "";
const BRAND_LABEL = process.env.BRAND_LABEL || "Crush AI";
const MINT_PUBLIC = process.env.NEXT_PUBLIC_CRUSH_MINT || "";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }

    // Basic env validation with explicit error codes
    if (!RECEIVER) return res.status(500).json({ error: "env_missing_PAY_RECEIVER" });
    if (!MINT_PUBLIC) return res.status(500).json({ error: "env_missing_NEXT_PUBLIC_CRUSH_MINT" });
    if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) {
      return res.status(500).json({ error: "env_missing_KV_REST_API_URL_or_UPSTASH_REDIS_REST_URL" });
    }
    if (!process.env.KV_REST_API_TOKEN && !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return res.status(500).json({ error: "env_missing_KV_REST_API_TOKEN_or_UPSTASH_REDIS_REST_TOKEN" });
    }

    const { wallet, itemId, ref } = req.body || {};
    if (!wallet || String(wallet).length < 25) return res.status(400).json({ error: "wallet_missing_or_invalid" });
    if (!itemId) return res.status(400).json({ error: "itemId_required" });

    // Dynamic import of payments to avoid build-time fatal errors
    let payments;
    try {
      payments = await import("../../../lib/payments");
    } catch (e) {
      try { console.error("pay/create payments_import_error:", e); } catch {}
      return res.status(500).json({ error: "payments_import_error" });
    }
    const { getItem, isBundle, getBundle, CRUSH_MINT } = payments;

    if (!CRUSH_MINT || CRUSH_MINT !== MINT_PUBLIC) {
      // Not fatal, but good to know if mismatched
      try { console.warn("pay/create mint_mismatch", { CRUSH_MINT, MINT_PUBLIC }); } catch {}
    }

    // Resolve product
    let title = "", priceCrush = 0;
    if (isBundle?.(itemId)) {
      const b = getBundle?.(itemId);
      if (!b) return res.status(400).json({ error: "unknown_bundle" });
      title = b.title; priceCrush = Number(b.priceCrush || 0);
    } else {
      const item = getItem?.(itemId);
      if (!item) return res.status(400).json({ error: "unknown_item" });
      title = item.title || itemId; priceCrush = Number(item.priceCrush || 0);
    }
    if (!Number.isFinite(priceCrush) || priceCrush <= 0) {
      return res.status(400).json({ error: "invalid_price" });
    }

    // Robust reference: 32 random bytes → base58
    const reference = bs58.encode(randomBytes(32));

    // Memo ties tx to this item; keep attribution if present
    const memo = `crush:${itemId}${ref ? `:ref=${encodeURIComponent(ref)}` : ""}`;

    const params = new URLSearchParams({
      amount: String(Math.trunc(priceCrush)),
      "spl-token": MINT_PUBLIC,
      reference,
      label: BRAND_LABEL,
      message: `Unlock ${title}`,
      memo,
    });

    const solanaUrl    = `solana:${RECEIVER}?${params.toString()}`;
    const universalUrl = `https://phantom.app/ul/v1/solana-pay?recipient=${RECEIVER}&${params.toString()}`;

    // Bind reference → expected item (anti-spoof) for 15 minutes
    try {
      await kv.set(`pay:ref:${reference}`, { itemId }, { ex: 900 });
    } catch (e) {
      try { console.error("pay/create kv_set_error:", e); } catch {}
      return res.status(500).json({ error: "kv_set_error" });
    }

    noStore(res);
    return res.status(200).json({
      ok: true,
      url: solanaUrl,
      universalUrl,
      reference,
      receiver: RECEIVER,
      mint: MINT_PUBLIC,
      priceCrush: Math.trunc(priceCrush),
      label: BRAND_LABEL,
    });
  } catch (e) {
    try { console.error("pay/create fatal_error:", e); } catch {}
    noStore(res);
    return res.status(500).json({ error: "internal_error" });
  }
}
