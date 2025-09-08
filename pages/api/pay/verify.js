// pages/api/pay/verify.js
export const config = { runtime: "nodejs" };

import { getItem, isBundle, getBundleChildren, CRUSH_MINT } from "../../../lib/payments";
import { grantEntitlement } from "../../../lib/entitlements";

/**
 * ENV:
 * - HELIUS_API_KEY or NEXT_PUBLIC_HELIUS_KEY
 * - SOLANA_RPC_PRIMARY / SOLANA_RPC_FALLBACK / NEXT_PUBLIC_SOLANA_RPC (optional)
 * - NEXT_PUBLIC_CRUSH_MINT
 * - PAY_RECEIVER or NEXT_PUBLIC_TREASURY
 */

const HELIUS_KEY = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_KEY || "";

const RPCS = [
  process.env.SOLANA_RPC_PRIMARY,
  process.env.SOLANA_RPC_FALLBACK,
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

const RECEIVER =
  process.env.PAY_RECEIVER || process.env.NEXT_PUBLIC_TREASURY || "";

const TIMEOUT_MS = 10_000;

const withTimeout = (p, ms = TIMEOUT_MS) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  for (const url of RPCS) {
    try {
      const r = await withTimeout(
        fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body }),
        TIMEOUT_MS
      );
      const j = await r.json();
      if (!j?.error) return j.result;
    } catch {}
  }
  return null;
}

export default async function handler(req, res) {
  try {
    const { wallet, itemId, reference } = req.query;

    if (!wallet || String(wallet).length < 25) {
      return res.status(400).json({ ok: false, error: "wallet missing/invalid" });
    }
    if (!itemId || !reference) {
      return res.status(400).json({ ok: false, error: "itemId and reference required" });
    }
    if (!RECEIVER) {
      return res.status(400).json({ ok: false, error: "PAY_RECEIVER not set" });
    }

    // Get price (bundle or single)
    let priceCrush = 0;
    if (isBundle(itemId)) {
      const children = getBundleChildren(itemId);
      if (!children?.length) return res.status(400).json({ ok: false, error: "unknown bundle" });
      priceCrush = Number(children.bundlePriceCrush || 0);
      if (!priceCrush) return res.status(400).json({ ok: false, error: "bundle missing price" });
    } else {
      const item = getItem(itemId);
      if (!item?.priceCrush) return res.status(400).json({ ok: false, error: "unknown item" });
      priceCrush = Number(item.priceCrush);
    }

    // 1) signatures involving reference
    const sigs = await rpc("getSignaturesForAddress", [
      reference,
      { limit: 25 },
    ]);
    if (!Array.isArray(sigs) || sigs.length === 0) {
      return res.status(200).json({ ok: false, reason: "no-sigs" });
    }

    // 2) full transactions
    const signatures = sigs.map((s) => s.signature);
    const txs = await rpc("getTransactions", [signatures, { maxSupportedTransactionVersion: 0 }]);

    // decimals + target raw
    const supply = await rpc("getTokenSupply", [CRUSH_MINT]);
    const decimals = Number(supply?.value?.decimals ?? 6);
    const wantRaw = BigInt(Math.round(priceCrush * 10 ** decimals));

    let matchedSig = null;

    for (const tx of txs || []) {
      try {
        const meta = tx?.meta;
        const msg = tx?.transaction?.message;
        if (!meta || !msg) continue;

        const accountKeys = (msg.accountKeys || []).map((k) => (typeof k === "string" ? k : k?.pubkey) || "").filter(Boolean);
        if (!accountKeys.includes(RECEIVER)) continue;
        if (!accountKeys.includes(wallet)) continue;

        const pre = meta?.preTokenBalances || [];
        const post = meta?.postTokenBalances || [];

        const preRecv = pre.find((b) => b?.mint === CRUSH_MINT && (b?.owner === RECEIVER || b?.uiTokenAmount?.owner === RECEIVER));
        const postRecv = post.find((b) => b?.mint === CRUSH_MINT && (b?.owner === RECEIVER || b?.uiTokenAmount?.owner === RECEIVER));

        if (!postRecv) continue;

        const preAmt = BigInt(preRecv?.uiTokenAmount?.amount ?? preRecv?.tokenAmount?.amount ?? "0");
        const postAmt = BigInt(postRecv?.uiTokenAmount?.amount ?? postRecv?.tokenAmount?.amount ?? "0");
        const delta = postAmt - preAmt;

        if (delta >= wantRaw) {
          matchedSig = tx?.transaction?.signatures?.[0] || signatures[0];
          break;
        }
      } catch {}
    }

    if (!matchedSig) {
      return res.status(200).json({ ok: false, reason: "no-match" });
    }

    // 3) Grant entitlement(s)
    if (isBundle(itemId)) {
      const children = getBundleChildren(itemId);
      for (const childId of children.ids) {
        try { await grantEntitlement(wallet, childId, matchedSig); } catch {}
      }
    } else {
      try { await grantEntitlement(wallet, itemId, matchedSig); } catch {}
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, signature: matchedSig });
  } catch (_e) {
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
