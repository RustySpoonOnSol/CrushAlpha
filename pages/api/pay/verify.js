// pages/api/pay/verify.js
export const config = { runtime: "nodejs" };

import { getItem } from "../../../lib/payments";
import { grantEntitlement } from "../../../lib/entitlements";

const HELIUS_KEY = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_KEY || "";

const RPCS = [
  process.env.SOLANA_RPC_PRIMARY,
  process.env.SOLANA_RPC_FALLBACK,
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

// ENV
const MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";
const RECEIVER =
  process.env.PAY_RECEIVER || process.env.NEXT_PUBLIC_TREASURY || "";

const TIMEOUT_MS = 9_000;
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

    const item = getItem(itemId);
    if (!item?.priceCrush || item.priceCrush <= 0) {
      return res.status(400).json({ ok: false, error: "unknown item or missing price" });
    }

    // 1) Find signatures that include the reference account
    // Using getSignaturesForAddress(reference)
    const sigs = await rpc("getSignaturesForAddress", [
      reference,
      { limit: 20 }, // small window; client polls for up to ~2 min
    ]);

    if (!Array.isArray(sigs) || sigs.length === 0) {
      return res.status(200).json({ ok: false, reason: "no-sigs" });
    }

    // 2) Fetch transactions and look for an SPL transfer of the mint to RECEIVER
    const txs = await rpc("getTransactions", [
      sigs.map((s) => s.signature),
      { maxSupportedTransactionVersion: 0 },
    ]);

    // Fetch decimals to compare amounts safely
    const supply = await rpc("getTokenSupply", [MINT]);
    const decimals = Number(supply?.value?.decimals ?? 6); // usually 6/9
    const wantRaw = BigInt(Math.round(item.priceCrush * 10 ** decimals));

    let matchedSig = null;

    for (const tx of txs || []) {
      try {
        const meta = tx?.meta;
        const msg = tx?.transaction?.message;
        if (!meta || !msg) continue;

        // Quick receiver presence check
        const keys = (msg.accountKeys || []).map((k) => (typeof k === "string" ? k : k?.pubkey) || "").filter(Boolean);
        if (!keys.includes(RECEIVER)) continue;

        // Check parsed inner instructions for a token transfer of the right mint to RECEIVER
        const ii = meta?.innerInstructions || [];
        let got = false;

        for (const group of ii) {
          for (const ins of group?.instructions || []) {
            const parsed = ins?.parsed;
            if (!parsed) continue;

            // Token program transferChecked/transfer
            if (parsed.type === "transferChecked" || parsed.type === "transfer") {
              const info = parsed.info || {};
              const mint = info.mint || info.mintAddr;
              if (mint !== MINT) continue;

              const dest = info.destination || info.destinationOwner || info.destinationPubkey || info.dest;
              if (!dest) continue;

              // We want destination OWNER == RECEIVER (final receiver's ATA owner)
              const postTokenBalances = meta.postTokenBalances || [];
              const match = postTokenBalances.find(
                (b) =>
                  (b?.owner === RECEIVER || b?.uiTokenAmount?.owner === RECEIVER) &&
                  b?.mint === MINT
              );
              if (!match) continue;

              // Amount: compare raw if available, else ui + decimals
              let amtRaw = null;
              if (info.tokenAmount?.amount) {
                amtRaw = BigInt(info.tokenAmount.amount);
              } else if (info.amount) {
                // amount may be ui; coerce
                const ui = Number(info.amount);
                if (Number.isFinite(ui)) amtRaw = BigInt(Math.round(ui * 10 ** decimals));
              }
              if (amtRaw === null) continue;

              if (amtRaw >= wantRaw) {
                // Also ensure payer/sender address matches wallet (to avoid someone else’s tx)
                const acctMatch = keys.includes(wallet);
                if (acctMatch) {
                  matchedSig = tx?.transaction?.signatures?.[0] || null;
                  got = true;
                  break;
                }
              }
            }
          }
          if (got) break;
        }

        if (got && matchedSig) break;
      } catch {}
    }

    if (!matchedSig) {
      return res.status(200).json({ ok: false, reason: "no-match" });
    }

    // 3) Grant entitlement for this wallet+item
    try {
      await grantEntitlement(wallet, itemId, { signature: matchedSig });
    } catch {}

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, signature: matchedSig });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
