// pages/api/pay/create.js
export const config = { runtime: "nodejs" };

import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import { createClient } from "@vercel/kv";

const kv = createClient({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

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

    // env guardrails
    if (!RECEIVER) return res.status(500).json({ error: "env_missing_PAY_RECEIVER" });
    if (!MINT_PUBLIC) return res.status(500).json({ error: "env_missing_NEXT_PUBLIC_CRUSH_MINT" });
    if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL)
      return res.status(500).json({ error: "env_missing_KV_REST_API_URL_or_UPSTASH_REDIS_REST_URL" });
    if (!process.env.KV_REST_API_TOKEN && !process.env.UPSTASH_REDIS_REST_TOKEN)
      return res.status(500).json({ error: "env_missing_KV_REST_API_TOKEN_or_UPSTASH_REDIS_REST_TOKEN" });

    const { wallet, itemId, ref } = req.body || {};
    if (!wallet || String(wallet).length < 25) return res.status(400).json({ error: "wallet_missing_or_invalid" });
    if (!itemId) return res.status(400).json({ error: "itemId_required" });

    // dynamic import => avoids build-time fatal if lib changes
    let payments;
    try {
      payments = await import("../../../lib/payments");
    } catch (e) {
      try { console.error("pay/create payments_import_error:", e); } catch {}
      return res.status(500).json({ error: "payments_import_error" });
    }
    const { getItem, isBundle, getBundle, CRUSH_MINT } = payments;

    // resolve product + price
    let title = "", priceCrush = 0;
    if (isBundle?.(itemId)) {
      const b = getBundle?.(itemId);
      if (!b) return res.status(400).json({ error: "unknown_bundle" });
      title = b.title; priceCrush = Number(b.priceCrush || 0);
    } else {
      const it = getItem?.(itemId);
      if (!it) return res.status(400).json({ error: "unknown_item" });
      title = it.title || itemId; priceCrush = Number(it.priceCrush || 0);
    }
    if (!Number.isFinite(priceCrush) || priceCrush <= 0)
      return res.status(400).json({ error: "invalid_price" });

    // robust reference: 32 random bytes -> base58
    const reference = bs58.encode(randomBytes(32));

    // memo binds tx → item (optional attribution)
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

    // bind reference → item (anti-spoof), 15 min TTL
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
