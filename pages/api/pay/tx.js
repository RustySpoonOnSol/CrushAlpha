// pages/api/pay/tx.js
export const config = { runtime: "nodejs" };

import {
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  Connection,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import { createClient } from "@vercel/kv";

// ---- KV (for reference binding check) ----
const kv = createClient({
  url:
    process.env.CRUSH_KV_URL ||
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL,
  token:
    process.env.CRUSH_KV_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ---- Config ----
const RECEIVER =
  process.env.PAY_RECEIVER || process.env.NEXT_PUBLIC_TREASURY || "";
const CRUSH_MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";

// Memo program
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

// RPC rotation (simple)
const HELIUS = process.env.NEXT_PUBLIC_HELIUS_KEY || process.env.HELIUS_API_KEY;
const RPCS = [
  process.env.SOLANA_RPC_PRIMARY,
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  HELIUS ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);
const pickRpc = () => RPCS[Math.floor(Math.random() * RPCS.length)];

// small helpers
function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
}
async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const j = await r.json();
      if (!j?.error) return j.result;
    } catch {}
  }
  throw new Error("RPC failed");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "method not allowed" });
    }

    const { wallet = "", itemId = "", reference = "" } = await req.json?.() ||
      req.body || {};
    if (!wallet || wallet.length < 25 || !itemId) {
      noStore(res);
      return res.status(400).json({ ok: false, error: "bad_request" });
    }
    if (!RECEIVER) {
      noStore(res);
      return res.status(400).json({ ok: false, error: "PAY_RECEIVER not set" });
    }

    // price lookup (mirror of /api/pay/create)
    const PRICE_MAP = {
      "vip-gallery-01-1": 250,
      "vip-gallery-01-2": 300,
      "vip-gallery-01-3": 400,
      "pp-02-1": 500,
      "pp-02-2": 750,
      "pp-02-3": 1000,
      "bundle-vip-01": 600,
    };
    const title = itemId;
    const priceCrush = PRICE_MAP[itemId];
    if (!(priceCrush > 0)) {
      noStore(res);
      return res.status(400).json({ ok: false, error: "invalid_price" });
    }

    // sanity: reference should be bound by /create
    if (reference) {
      const bound = await kv.get(`pay:ref:${reference}`);
      if (!bound || bound.itemId !== itemId) {
        noStore(res);
        return res
          .status(400)
          .json({ ok: false, error: "reference_not_bound" });
      }
    }

    const payer = new PublicKey(wallet);
    const receiverOwner = new PublicKey(RECEIVER);
    const mint = new PublicKey(CRUSH_MINT);

    // decimals
    const supply = await rpc("getTokenSupply", [CRUSH_MINT]);
    const decimals = Number(supply?.value?.decimals ?? 9);

    // to base units (u64)
    const amountU64 = Number(
      BigInt(Math.trunc(priceCrush)) * 10n ** BigInt(decimals)
    );

    const conn = new Connection(pickRpc(), "confirmed");
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));

    // ATAs
    const srcAta = await getAssociatedTokenAddress(mint, payer, false);
    const dstAta = await getAssociatedTokenAddress(mint, receiverOwner, false);

    // Ensure payer ATA exists (edge case: never received $CRUSH yet)
    const srcInfo = await conn.getAccountInfo(srcAta);
    if (!srcInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer, // payer
          srcAta,
          payer, // owner = payer
          mint
        )
      );
    }

    // Ensure receiver ATA exists
    const dstInfo = await conn.getAccountInfo(dstAta);
    if (!dstInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer, // payer
          dstAta,
          receiverOwner,
          mint
        )
      );
    }

    // TransferChecked
    const ix = createTransferCheckedInstruction(
      srcAta, // from ATA
      mint, // mint
      dstAta, // to ATA
      payer, // owner of source
      amountU64,
      decimals
    );

    // add Solana Pay "reference" so we can index by it
    if (reference) {
      ix.keys.push({
        pubkey: new PublicKey(reference),
        isSigner: false,
        isWritable: false,
      });
    }
    tx.add(ix);

    // Memo (tie to item)
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

    // Serialize (unsigned) for Phantom signAndSendTransaction
    const b64 = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString(
      "base64"
    );

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
    try {
      console.error("pay/tx error:", e);
    } catch {}
    noStore(res);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
