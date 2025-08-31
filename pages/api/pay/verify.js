// pages/api/pay/verify.js
export const config = { runtime: "nodejs" };

import { getItem, TREASURY, CRUSH_MINT } from "../../../lib/payments";
import { grantEntitlement } from "../../../lib/entitlements";

const HELIUS = process.env.HELIUS_API_KEY || "";
const RPCS = [
  process.env.SOLANA_RPC_PRIMARY,
  process.env.SOLANA_RPC_FALLBACK,
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  HELIUS ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

const TIMEOUT_MS = 8_000;
const withTimeout = (p, ms = TIMEOUT_MS) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

export default async function handler(req, res) {
  try {
    const wallet = String(req.query.wallet || "").trim();
    const itemId = String(req.query.itemId || "").trim();
    const reference = String(req.query.reference || "").trim();

    if (!wallet || wallet.length < 25) return res.status(400).json({ ok: false, reason: "bad-wallet" });
    if (!itemId || !reference) return res.status(400).json({ ok: false, reason: "missing" });

    const item = getItem(itemId);
    if (!item) return res.status(404).json({ ok: false, reason: "unknown-item" });

    const memoTarget = `crush:${itemId}:${reference}`;

    // 1) Scan recent signatures for the treasury (fast path)
    const sig = await findSigWithMemoForTreasury(memoTarget);
    if (!sig) {
      res.setHeader("Cache-Control", "private, max-age=5");
      return res.status(200).json({ ok: false, pending: true });
    }

    // 2) Fetch tx, validate SPL-token transfer of CRUSH amount to TREASURY involving wallet
    const tx = await getTx(sig);
    const valid = validateCrushTransfer(tx, {
      wallet,
      treasury: TREASURY,
      mint: CRUSH_MINT,
      amount: Number(item.priceCrush || 0),
      memo: memoTarget,
    });

    if (!valid) {
      res.setHeader("Cache-Control", "private, max-age=5");
      return res.status(200).json({ ok: false, pending: true });
    }

    // 3) Record entitlement
    await grantEntitlement(wallet, itemId, sig);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, signature: sig });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}

async function rpc(method, params) {
  const payload = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  for (const url of RPCS) {
    try {
      const r = await withTimeout(
        fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: payload }),
        TIMEOUT_MS
      );
      const j = await r.json();
      if (!j?.error) return j.result;
    } catch {}
  }
  return null;
}

async function findSigWithMemoForTreasury(memoTarget) {
  // Check the last N signatures on the treasury account and inspect memos.
  const N = 100;
  const sigs = await rpc("getSignaturesForAddress", [TREASURY, { limit: N }]);
  if (!Array.isArray(sigs)) return null;
  for (const s of sigs) {
    const tx = await getTx(s.signature);
    const memos = extractMemos(tx);
    if (memos.some((m) => m === memoTarget)) return s.signature;
  }
  return null;
}

async function getTx(signature) {
  return await rpc("getTransaction", [
    signature,
    { maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  ]);
}

function extractMemos(tx) {
  try {
    const inst = tx?.transaction?.message?.instructions || [];
    const out = [];
    for (const ix of inst) {
      const pid = ix?.program || ix?.programId;
      if (
        pid === "spl-memo" ||
        pid === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" ||
        pid === "Memo111111111111111111111111111111111111111"
      ) {
        const dataB64 = ix?.data;
        if (!dataB64) continue;
        const str = Buffer.from(dataB64, "base64").toString("utf-8");
        if (str) out.push(str);
      }
    }
    return out;
  } catch {
    return [];
  }
}

function validateCrushTransfer(tx, { wallet, treasury, mint, amount, memo }) {
  try {
    if (!tx?.meta) return false;

    // Ensure memo is present (double-check)
    const memos = extractMemos(tx);
    if (!memos.some((m) => m === memo)) return false;

    // Verify $CRUSH credited to treasury
    const pre = tx.meta.preTokenBalances || [];
    const post = tx.meta.postTokenBalances || [];
    const preTr = pre.find((b) => b.mint === mint && b.owner === treasury);
    const postTr = post.find((b) => b.mint === mint && b.owner === treasury);
    const preAmt = Number(preTr?.uiTokenAmount?.uiAmount || 0);
    const postAmt = Number(postTr?.uiTokenAmount?.uiAmount || 0);
    const delta = postAmt - preAmt;
    if (delta + 1e-9 < Number(amount || 0)) return false;

    // Ensure user wallet participated
    const acctKeys = tx?.transaction?.message?.accountKeys?.map((k) => k?.pubkey || k) || [];
    if (!acctKeys.includes(wallet)) return false;

    return true;
  } catch {
    return false;
  }
}
