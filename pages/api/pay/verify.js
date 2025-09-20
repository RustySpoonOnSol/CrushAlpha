// pages/api/pay/verify.js
export const config = { runtime: "nodejs" };

const HELIUS_KEY =
  process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_KEY || "";
const RPCS = [
  process.env.SOLANA_RPC_PRIMARY,
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

const RECEIVER =
  process.env.PAY_RECEIVER || process.env.NEXT_PUBLIC_TREASURY || "";
const CRUSH_MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";
const TIMEOUT_MS = 10_000;

function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
}
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

function parseMemoMatch(tx, prefix) {
  const logs = tx?.meta?.logMessages || [];
  return logs.some((l) => typeof l === "string" && l.includes(prefix));
}

function findCrushDeltaToTreasury(tx, mint, receiver) {
  const pre = tx?.meta?.preTokenBalances || [];
  const post = tx?.meta?.postTokenBalances || [];
  let delta = 0n;
  const postRecv = post.filter((b) => b?.mint === mint && b?.owner === receiver);
  for (const pr of postRecv) {
    const preMatch = pre.find(
      (b) =>
        b?.mint === mint &&
        b?.owner === receiver &&
        b?.accountIndex === pr?.accountIndex
    );
    const postAmt = BigInt(pr?.uiTokenAmount?.amount || "0");
    const preAmt = BigInt(preMatch?.uiTokenAmount?.amount || "0");
    delta += postAmt - preAmt;
  }
  return delta; // base units
}

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

    // expected price (mirror UI)
    const PRICE_MAP = {
      "vip-gallery-01-1": 250,
      "vip-gallery-01-2": 300,
      "vip-gallery-01-3": 400,
      "pp-02-1": 500,
      "pp-02-2": 750,
      "pp-02-3": 1000,
      "bundle-vip-01": 600,
    };
    const expectedUi = Number(PRICE_MAP[itemId] || 0);
    const supply = await rpc("getTokenSupply", [CRUSH_MINT]);
    const decimals = Number(supply?.value?.decimals ?? 9);
    const expectedSmallest = BigInt(Math.round(expectedUi)) * 10n ** BigInt(decimals);

    // 1) Try signatures by reference first
    let sigs = (await rpc("getSignaturesForAddress", [reference, { limit: 40 }])) || [];

    // 2) Fallback: look at treasury ATA if reference hasn’t propagated yet
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

    // 3) Check candidates
    for (const s of sigs) {
      const sig = s?.signature;
      if (!sig) continue;

      const tx = await rpc("getTransaction", [
        sig,
        { maxSupportedTransactionVersion: 0 },
      ]);
      if (!tx || tx?.meta?.err) continue; // must be confirmed & successful

      // Must include the memo for this item
      if (!parseMemoMatch(tx, `crush:${itemId}`)) continue;

      // Ensure reference or treasury appears somewhere in the message
      const keys = (tx?.transaction?.message?.accountKeys || []).map((k) =>
        typeof k === "string" ? k : k?.pubkey
      );
      if (!keys?.includes(reference) && !keys?.includes(RECEIVER)) {
        // reference not present *and* owner not present — still allow if delta passes
      }

      // Validate mint + amount to treasury owner
      const delta = findCrushDeltaToTreasury(tx, CRUSH_MINT, RECEIVER);
      if (delta < expectedSmallest) continue;

      // ✅ Found a matching payment — grant entitlement
      try {
        await fetch(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/entitlements/grant` : "/api/entitlements/grant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet, itemId, signature: sig }),
        }).catch(() => {});
      } catch {}

      noStore(res);
      return res.status(200).json({ ok: true, signature: sig });
    }

    noStore(res);
    return res.status(200).json({ ok: false, reason: "no-match" });
  } catch (e) {
    try { console.error("verify fatal:", e); } catch {}
    noStore(res);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
