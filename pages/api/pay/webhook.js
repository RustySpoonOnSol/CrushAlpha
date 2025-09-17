// pages/api/pay/webhook.js
export const config = { runtime: "nodejs" };

import { grantEntitlement, grantEntitlements } from "../../../lib/entitlements";
import { getItem, isBundle, getBundleChildren, CRUSH_MINT } from "../../../lib/payments";
import { kv } from "@vercel/kv";

const RECEIVER = process.env.PAY_RECEIVER || process.env.NEXT_PUBLIC_TREASURY || "";

// headers helper
function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
}

function extractMemoItemId(logs) {
  for (const l of logs || []) {
    if (typeof l !== "string") continue;
    const m = l.match(/crush:([a-zA-Z0-9\-_]+)/);
    if (m) return m[1];
  }
  return null;
}

function deltaCrushToTreasury(tx, mint, receiver) {
  const pre = tx?.meta?.preTokenBalances || [];
  const post = tx?.meta?.postTokenBalances || [];
  let delta = 0n;
  for (const pb of post) {
    if (pb?.mint === mint && pb?.owner === receiver) {
      const preMatch = pre.find((x) => x?.mint === mint && x?.owner === receiver && x?.accountIndex === pb?.accountIndex);
      const postAmt = BigInt(pb?.uiTokenAmount?.amount || "0");
      const preAmt = BigInt(preMatch?.uiTokenAmount?.amount || "0");
      delta += (postAmt - preAmt);
    }
  }
  return delta;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "method not allowed" });
    }

    const payload = req.body || {};
    // Helius (parsed) commonly uses `transactions`; also allow `data`
    const txs = Array.isArray(payload?.transactions) ? payload.transactions
             : Array.isArray(payload?.data) ? payload.data
             : [];

    if (!txs.length) {
      noStore(res);
      return res.status(200).json({ ok: true }); // ack
    }

    for (const tx of txs) {
      const signature = tx?.transaction?.signatures?.[0] || tx?.signature || null;
      const logs = tx?.meta?.logMessages || [];
      const itemId = extractMemoItemId(logs);
      if (!itemId) continue;

      const item = getItem(itemId);
      if (!item) continue;

      // Validate CRUSH delta to RECEIVER
      const delta = deltaCrushToTreasury(tx, CRUSH_MINT, RECEIVER);
      if (delta <= 0n) continue; // nothing received

      // Account keys & payer
      const accountKeys = tx?.transaction?.message?.accountKeys?.map((k) => (typeof k === "string" ? k : k?.pubkey)) || [];
      const payer = accountKeys?.[0] || null;

      // *** Reference binding: require a key present that we issued for this item ***
      let matchedRef = null;
      for (const k of accountKeys) {
        if (!k || k === payer || k === RECEIVER) continue;
        const entry = await kv.get(`pay:ref:${k}`);
        if (entry?.itemId === itemId) { matchedRef = k; break; }
      }
      if (!matchedRef) continue; // ignore transactions we didn't initiate

      // Figure out the buyer wallet (best effort)
      const wallet =
        tx?.meta?.preTokenBalances?.[0]?.owner ||
        tx?.accountData?.tokenTransfers?.[0]?.fromUserAccount ||
        payer ||
        null;
      if (!wallet) continue;

      // Grant entitlement(s) idempotently
      if (isBundle(itemId)) {
        const { ids } = getBundleChildren(itemId);
        await grantEntitlements(wallet, ids, signature || "webhook");
      } else {
        await grantEntitlement(wallet, itemId, signature || "webhook");
      }

      // Publish SSE to the exact reference channel
      try {
        await kv.publish(`pay:${matchedRef}`, JSON.stringify({ ok: true, itemId, sig: signature || "webhook" }));
      } catch {}
    }

    noStore(res);
    return res.status(200).json({ ok: true });
  } catch {
    noStore(res);
    return res.status(200).json({ ok: true }); // ack; log elsewhere to avoid retries
  }
}
