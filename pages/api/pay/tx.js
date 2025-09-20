// pages/api/pay/tx.js
export const config = { runtime: "nodejs" };

import { PublicKey, Transaction, SystemProgram, ComputeBudgetProgram, Connection } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";

// ---- KV client (for your existing reference binding + SSE later if you want) ----
import { createClient } from "@vercel/kv";
const kv = createClient({
  url: process.env.CRUSH_KV_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.CRUSH_KV_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ---- Env / RPCs ----
const RECEIVER = process.env.PAY_RECEIVER || process.env.NEXT_PUBLIC_TREASURY || "";
const HELIUS_KEY = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_KEY || "";
const RPCS = [
  process.env.SOLANA_RPC_PRIMARY,
  process.env.SOLANA_RPC_FALLBACK,
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

function pickRpc() { return RPCS[Math.floor(Math.random() * RPCS.length)]; }

// Simple RPC helper
async function rpc(method, params) {
  for (let i = 0; i < RPCS.length; i++) {
    const url = RPCS[(i + Math.floor(Math.random() * RPCS.length)) % RPCS.length];
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const j = await r.json();
      if (!j?.error) return j.result;
    } catch {}
  }
  return null;
}

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    if (!RECEIVER) return res.status(500).json({ ok: false, error: "env_missing_PAY_RECEIVER" });

    const { wallet, itemId, reference } = req.body || {};
    if (!wallet || String(wallet).length < 25) return res.status(400).json({ ok: false, error: "wallet_invalid" });
    if (!itemId) return res.status(400).json({ ok: false, error: "itemId_required" });

    // Get product & mint
    let payments;
    try { payments = await import("../../../lib/payments"); }
    catch { return res.status(500).json({ ok: false, error: "payments_import_error" }); }
    const { getItem, isBundle, getBundle, CRUSH_MINT } = payments;
    if (!CRUSH_MINT) return res.status(500).json({ ok: false, error: "env_missing_CRUSH_MINT" });

    // Resolve price in whole tokens (e.g. 250)
    let title = "", priceCrush = 0;
    if (isBundle?.(itemId)) {
      const b = getBundle?.(itemId);
      if (!b) return res.status(400).json({ ok: false, error: "unknown_bundle" });
      title = b.title; priceCrush = Number(b.priceCrush || 0);
    } else {
      const it = getItem?.(itemId);
      if (!it) return res.status(400).json({ ok: false, error: "unknown_item" });
      title = it.title || itemId; priceCrush = Number(it.priceCrush || 0);
    }
    if (!(priceCrush > 0)) return res.status(400).json({ ok: false, error: "invalid_price" });

    // Ensure reference persisted (anti-spoof) if you used /create first
    if (reference) {
      const bound = await kv.get(`pay:ref:${reference}`);
      if (!bound || bound.itemId !== itemId) {
        return res.status(400).json({ ok: false, error: "reference_not_bound" });
      }
    }

    // Build SPL transfer
    const payer = new PublicKey(wallet);
    const receiverOwner = new PublicKey(RECEIVER);
    const mint = new PublicKey(CRUSH_MINT);

    // decimals
    const supply = await rpc("getTokenSupply", [CRUSH_MINT]);
    const decimals = Number(supply?.value?.decimals ?? 9);

    // to smallest units
    const amountSmallest = BigInt(Math.trunc(priceCrush)) * (10n ** BigInt(decimals));
    const amountU64 = Number(amountSmallest); // 250e9 fits in JS safe integer

    const conn = new Connection(pickRpc(), "confirmed");

    // derive ATAs
    const srcAta = await getAssociatedTokenAddress(mint, payer, false);
    const dstAta = await getAssociatedTokenAddress(mint, receiverOwner, false);

    // create tx
    const tx = new Transaction();
    // Optional: a little more CU
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));

    // Ensure receiver ATA exists (payer funds creation if missing)
    const dstInfo = await conn.getAccountInfo(dstAta);
    if (!dstInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer,          // payer
          dstAta,         // associated token account
          receiverOwner,  // ATA owner
          mint
        )
      );
    }

    // Transfer checked
    const ix = createTransferCheckedInstruction(
      srcAta, mint, dstAta, payer, amountU64, decimals
    );

    // Add Solana Pay "reference" as a readonly key so we can find it on-chain
    if (reference) {
      ix.keys.push({
        pubkey: new PublicKey(reference),
        isSigner: false,
        isWritable: false,
      });
    }
    tx.add(ix);

    // Add memo to tie the purchase to the product
    const memo = `crush:${itemId}`;
    tx.add({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo, "utf8"),
    });

    // recent blockhash + fee payer
    const { blockhash } = await conn.getLatestBlockhash("finalized");
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer;

    // Return base64 (unsigned) for Phantom to sign & send
    const b64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    noStore(res);
    return res.status(200).json({
      ok: true,
      title,
      mint: CRUSH_MINT,
      decimals,
      amountUi: Math.trunc(priceCrush),
      txBase64: b64,
    });
  } catch (e) {
    try { console.error("pay/tx error:", e); } catch {}
    noStore(res);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
