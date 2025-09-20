// pages/api/pay/verify.js
// Robust verifier: scans by reference, then treasury ATA(s); validates memo, mint & net delta.
// On success: upserts entitlement directly to Supabase and publishes SSE to KV.
//
// Runtime: Node (heavy RPC, @vercel/kv)
export const config = { runtime: "nodejs" };

import { createClient as createKv } from "@vercel/kv";

// ---------- Env / Config ----------
const HELIUS_KEY =
  process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_KEY || "";

const RPCS = [
  process.env.SOLANA_RPC_PRIMARY,
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

const RECEIVER =
  process.env.PAY_RECEIVER || process.env.NEXT_PUBLIC_TREASURY || ""; // treasury owner (wallet)
const CRUSH_MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";

const SUPA_URL = process.env.SUPABASE_URL || "";
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// KV client with flexible env names (handles your CRUSH_KV_* / KV_REST_* / UPSTASH_* fallbacks)
const kv = createKv({
  url:
    process.env.CRUSH_KV_URL ||
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL,
  token:
    process.env.CRUSH_KV_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN,
});

const TIMEOUT_MS = 10_000;

function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
}

const withTimeout = (p, ms = TIMEOUT_MS) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);

// ---------- JSON-RPC helper ----------
async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  for (const url of RPCS) {
    try {
      const r = await withTimeout(
        fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        }),
        TIMEOUT_MS
      );
      const j = await r.json();
      if (!j?.error) return j.result;
    } catch {}
  }
  return null;
}

// ---------- Tx parsing helpers ----------
function parseMemoMatch(tx, prefix) {
  // Match via logMessages (works across versions)
  const logs = tx?.meta?.logMessages || [];
  return logs.some((l) => typeof l === "string" && l.includes(prefix));
}

function findCrushDeltaToTreasury(tx, mint, receiverOwner) {
  // Sum net delta to ANY of receiver's token accounts in this tx
  const pre = tx?.meta?.preTokenBalances || [];
  const post = tx?.meta?.postTokenBalances || [];
  let delta = 0n;
  const postRecv = post.filter(
    (b) => b?.mint === mint && b?.owner === receiverOwner
  );
  for (const pr of postRecv) {
    const preMatch = pre.find(
      (b) =>
        b?.mint === mint &&
        b?.owner === receiverOwner &&
        b?.accountIndex === pr?.accountIndex
    );
    const postAmt = BigInt(pr?.uiTokenAmount?.amount || "0");
    const preAmt = BigInt(preMatch?.uiTokenAmount?.amount || "0");
    delta += postAmt - preAmt;
  }
  return delta; // base units (mint decimals)
}

// ---------- Supabase upsert (idempotent) ----------
async function upsertEntitlement({ wallet, itemId, signature }) {
  if (!SUPA_URL || !SUPA_KEY) return;
  try {
    await fetch(`${SUPA_URL}/rest/v1/entitlements?on_conflict=wallet,item_id`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify([{ wallet, item_id: itemId, signature }]),
    });
  } catch {}
}

// ---------- KV publish (SSE) ----------
async function publishUnlock({ reference, wallet, itemId, signature }) {
  const payload = {
    ok: true,
    wallet,
    itemId,
    signature,
    ts: Date.now(),
  };
  try {
    // Publish to multiple channels to cover any subscriber patterns
    await Promise.allSettled([
      kv.publish(`pay:${reference}`, JSON.stringify(payload)),
      kv.publish(`pay:ref:${reference}`, JSON.stringify(payload)),
      kv.publish("pay:ref", JSON.stringify({ reference, ...payload })),
    ]);
  } catch {}
}

// ---------- Price map ----------
const PRICE_MAP = {
  "vip-gallery-01-1": 250,
  "vip-gallery-01-2": 300,
  "vip-gallery-01-3": 400,
  "pp-02-1": 500,
  "pp-02-2": 750,
  "pp-02-3": 1000,
  "bundle-vip-01": 600,
};

// ===================================================================

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ ok: false, error: "method not allowed" });
    }

    const wallet = String(req.query.wallet || "");
    const itemId = String(req.query.itemId || "");
    const reference = String(req.query.reference || "");

    if (!wallet || wallet.length < 25) {
      noStore(res);
      return res.status(400).json({ ok: false, error: "wallet invalid" });
    }
    if (!itemId || !reference) {
      noStore(res);
      return res
        .status(400)
        .json({ ok: false, error: "itemId and reference required" });
    }
    if (!RECEIVER) {
      noStore(res);
      return res.status(400).json({ ok: false, error: "PAY_RECEIVER not set" });
    }

    // Expected amount in smallest units
    const expectedUi = Number(PRICE_MAP[itemId] || 0);
    if (!(expectedUi > 0)) {
      noStore(res);
      return res.status(400).json({ ok: false, error: "invalid_price_item" });
    }

    const supply = await rpc("getTokenSupply", [CRUSH_MINT]);
    const decimals = Number(supply?.value?.decimals ?? 9);
    const expectedSmallest =
      BigInt(Math.round(expectedUi)) * 10n ** BigInt(decimals);

    // 1) Try signatures by the reference pubkey (Solana Pay index)
    let sigs =
      (await rpc("getSignaturesForAddress", [reference, { limit: 40 }])) || [];

    // 2) Fallback: scan treasury CRUSH ATA(s) if reference hasn't propagated yet
    if (!Array.isArray(sigs) || sigs.length === 0) {
      const tokenAccs =
        (await rpc("getTokenAccountsByOwner", [
          RECEIVER,
          { mint: CRUSH_MINT },
          { encoding: "jsonParsed" },
        ])) || { value: [] };

      for (const acc of tokenAccs.value || []) {
        const addr = acc?.pubkey;
        if (!addr) continue;
        const s2 = await rpc("getSignaturesForAddress", [addr, { limit: 40 }]);
        if (Array.isArray(s2) && s2.length) sigs = sigs.concat(s2);
      }
    }

    if (!Array.isArray(sigs) || sigs.length === 0) {
      noStore(res);
      return res.status(200).json({ ok: false, reason: "no-sigs" });
    }

    // 3) Inspect candidates
    for (const s of sigs) {
      const sig = s?.signature;
      if (!sig) continue;

      const tx = await rpc("getTransaction", [
        sig,
        { maxSupportedTransactionVersion: 0 },
      ]);
      if (!tx || tx?.meta?.err) continue; // must be confirmed & successful

      // a) Must include memo "crush:<itemId>"
      if (!parseMemoMatch(tx, `crush:${itemId}`)) continue;

      // b) Ensure payer wallet appears in account keys (owner signed)
      const keys = (tx?.transaction?.message?.accountKeys || []).map((k) =>
        typeof k === "string" ? k : k?.pubkey
      );
      if (!keys.includes(wallet)) {
        // If a delegate paid on user's behalf, you can relax this check by removing it.
        continue;
      }

      // c) Validate mint + amount credited to RECEIVER (net delta)
      const delta = findCrushDeltaToTreasury(tx, CRUSH_MINT, RECEIVER);
      if (delta < expectedSmallest) continue;

      // ✅ Match found — persist + publish (idempotent)
      await Promise.allSettled([
        upsertEntitlement({ wallet, itemId, signature: sig }),
        publishUnlock({ reference, wallet, itemId, signature: sig }),
      ]);

      noStore(res);
      return res.status(200).json({ ok: true, signature: sig });
    }

    // Nothing matched
    noStore(res);
    return res.status(200).json({ ok: false, reason: "no-match" });
  } catch (e) {
    try {
      console.error("verify fatal:", e);
    } catch {}
    noStore(res);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
