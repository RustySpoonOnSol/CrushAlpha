// pages/api/holdings/verify.js
// Robust balance lookup for Token & Token-2022 on Alchemy-compatible RPCs.
// - Prefers env mint (avoids wrong query mint).
// - Uses getTokenAccountsByOwner for both standard Token and Token-2022.
// - Accepts GET or POST.

export const config = { runtime: "nodejs" };

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

function rpcEndpoint() {
  return (
    process.env.SOLANA_RPC_PRIMARY ||
    process.env.NEXT_PUBLIC_SOLANA_RPC ||
    "https://api.mainnet-beta.solana.com"
  );
}

async function rpcCall(body) {
  const r = await fetch(rpcEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
  });
  return r.json();
}

function sumUiAmount(list) {
  return (list || []).reduce((sum, it) => {
    const ui = it?.account?.data?.parsed?.info?.tokenAmount;
    const v =
      typeof ui?.uiAmount === "number"
        ? ui.uiAmount
        : ui?.amount && ui?.decimals >= 0
        ? Number(ui.amount) / Math.pow(10, ui.decimals)
        : 0;
    return sum + Number(v || 0);
  }, 0);
}

export default async function handler(req, res) {
  try {
    const method = req.method || "GET";

    // Prefer env mint so a bad query param can’t break prod
    const ENV_MINT =
      process.env.NEXT_PUBLIC_CRUSH_MINT ||
      process.env.CRUSH_MINT ||
      "";

    let owner =
      req.query.owner || (req.body && JSON.parse(req.body || "{}").owner) || "";
    let mint =
      ENV_MINT ||
      req.query.mint ||
      (req.body && JSON.parse(req.body || "{}").mint) ||
      "";

    if (!owner || !mint) {
      return res.status(400).json({ error: "owner & mint required", owner, mint });
    }

    let amount = 0;
    let accounts = [];

    // (A) Simple path: filter by mint (covers standard Token)
    const byMint = await rpcCall({
      method: "getTokenAccountsByOwner",
      params: [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }],
    });

    if (!byMint?.error) {
      accounts = byMint?.result?.value || [];
      amount = sumUiAmount(accounts);
    }

    // (B) If still zero, check Token-2022: fetch all token-2022 accounts, then filter by mint
    if (amount === 0) {
      const byT22 = await rpcCall({
        method: "getTokenAccountsByOwner",
        params: [
          owner,
          { programId: TOKEN_2022_PROGRAM },
          { encoding: "jsonParsed", commitment: "confirmed" },
        ],
      });

      if (!byT22?.error && Array.isArray(byT22?.result?.value)) {
        const filtered = byT22.result.value.filter(
          (it) => it?.account?.data?.parsed?.info?.mint === mint
        );
        amount = sumUiAmount(filtered);
        if (amount > 0) accounts = filtered;
      }
    }

    // (C) Last-resort: if provider didn’t support (A) properly, try Token (legacy) program scan
    if (amount === 0) {
      const byTok = await rpcCall({
        method: "getTokenAccountsByOwner",
        params: [
          owner,
          { programId: TOKEN_PROGRAM },
          { encoding: "jsonParsed", commitment: "confirmed" },
        ],
      });

      if (!byTok?.error && Array.isArray(byTok?.result?.value)) {
        const filtered = byTok.result.value.filter(
          (it) => it?.account?.data?.parsed?.info?.mint === mint
        );
        amount = sumUiAmount(filtered);
        if (amount > 0) accounts = filtered;
      }
    }

    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
    return res.status(200).json({ amount, accounts: accounts.length });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
