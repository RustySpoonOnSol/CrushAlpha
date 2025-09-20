// pages/api/pay/verify.js
export const config = { runtime: "nodejs" };

const HELIUS_KEY = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_KEY || "";
const RPCS = [
  process.env.SOLANA_RPC_PRIMARY,
  process.env.SOLANA_RPC_FALLBACK,
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

const RECEIVER = process.env.PAY_RECEIVER || process.env.NEXT_PUBLIC_TREASURY || "";
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
  return delta;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    const wallet = String(req.query.wallet || "");
    const itemId = String(req.query.itemId || "");
    const reference = String(req.query.reference || "");
    if (!wallet || wallet.length < 25) { noStore(res); return res.status(400).json({ ok: false, error: "wallet_invalid" }); }
    if (!itemId || !reference) { noStore(res); return res.status(400).json({ ok: false, error: "itemId_and_reference_required" }); }
    if (!RECEIVER) { noStore(res); return res.status(500).json({ ok: false, error: "env_missing_PAY_RECEIVER" }); }

    // Dynamic imports keep build robust
    let payments, ents;
    try { payments = await import("../../../lib/payments"); }
    catch (e) { try { console.error("verify payments_import_error:", e); } catch {}; return res.status(500).json({ ok: false, error: "payments_import_error" }); }
    try { ents = await import("../../../lib/entitlements"); }
    catch (e) { try { console.error("verify entitlements_import_error:", e); } catch {}; return res.status(500).json({ ok: false, error: "entitlements_import_error" }); }

    const { getItem, isBundle, getBundleChildren, CRUSH_MINT } = payments;
    const { grantEntitlement, grantEntitlements } = ents;

    // Expected price (integer tokens)
    let expectedUi = 0;
    if (isBundle?.(itemId)) {
      const b = getBundleChildren?.(itemId);
      if (!b) { noStore(res); return res.status(400).json({ ok: false, error: "unknown_bundle" }); }
      expectedUi = Number(b.bundlePriceCrush || 0);
    } else {
      const it = getItem?.(itemId);
      if (!it) { noStore(res); return res.status(400).json({ ok: false, error: "unknown_item" }); }
      expectedUi = Number(it.priceCrush || 0);
    }

    // Convert to smallest units using BigInt
    const supply = await rpc("getTokenSupply", [CRUSH_MINT]);
    const decimalsNum = Number(supply?.value?.decimals ?? 9);
    const expectedSmallest = BigInt(Math.trunc(expectedUi)) * (10n ** BigInt(decimalsNum));

    // 1) Find candidate signatures that include the reference
    const sigs = await rpc("getSignaturesForAddress", [reference, { limit: 30 }]);
    if (!Array.isArray(sigs) || sigs.length === 0) { noStore(res); return res.status(200).json({ ok: false, reason: "no-sigs" }); }

    // 2) Verify each candidate
    for (const s of sigs) {
      const sig = s?.signature;
      if (!sig) continue;

      const tx = await rpc("getTransaction", [sig, { maxSupportedTransactionVersion: 0 }]);
      const msg = tx?.transaction?.message;
      const accountKeys = (msg?.accountKeys || []).map((k) => (typeof k === "string" ? k : k?.pubkey) || "");

      if (!accountKeys.includes(reference)) continue;
      if (!accountKeys.includes(RECEIVER)) continue;
      if (!parseMemoMatch(tx, `crush:${itemId}`)) continue;

      const delta = findCrushDeltaToTreasury(tx, CRUSH_MINT, RECEIVER);
      if (delta < expectedSmallest) continue;

      if (isBundle?.(itemId)) {
        const { ids } = getBundleChildren(itemId);
        await grantEntitlements(wallet, ids, sig);
      } else {
        await grantEntitlement(wallet, itemId, sig);
      }

      noStore(res);
      return res.status(200).json({ ok: true, signature: sig });
    }

    noStore(res);
    return res.status(200).json({ ok: false, reason: "no-match" });
  } catch (e) {
    try { console.error("verify fatal_error:", e); } catch {}
    noStore(res);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
