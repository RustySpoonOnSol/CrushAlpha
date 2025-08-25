// pages/api/holdings/list.js
// Lists all token balances for an owner across Token + Token-2022.
// Optional: ?resolve=1 to resolve top mints to symbols via Dexscreener.

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

function sumUi(list) {
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

async function resolveSymbol(mint) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { next: { revalidate: 30 } });
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.pairs?.[0];
    const sym = p?.baseToken?.symbol || p?.quoteToken?.symbol || null;
    return sym || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    const owner = req.query.owner || "";
    if (!owner) return res.status(400).json({ error: "owner required" });

    // A) all Token-2022 accounts
    const t22 = await rpcCall({
      method: "getTokenAccountsByOwner",
      params: [owner, { programId: TOKEN_2022_PROGRAM }, { encoding: "jsonParsed", commitment: "confirmed" }],
    });

    // B) all classic Token accounts
    const tok = await rpcCall({
      method: "getTokenAccountsByOwner",
      params: [owner, { programId: TOKEN_PROGRAM }, { encoding: "jsonParsed", commitment: "confirmed" }],
    });

    const rows = [];
    const byMint = new Map();

    function ingest(resp) {
      const arr = resp?.result?.value || [];
      for (const it of arr) {
        const info = it?.account?.data?.parsed?.info;
        const mint = info?.mint;
        const ui = info?.tokenAmount;
        if (!mint || !ui) continue;
        const val =
          typeof ui?.uiAmount === "number"
            ? ui.uiAmount
            : ui?.amount && ui?.decimals >= 0
            ? Number(ui.amount) / Math.pow(10, ui.decimals)
            : 0;
        if (!val) continue;
        const cur = byMint.get(mint) || { mint, amount: 0, decimals: ui?.decimals ?? null, accounts: 0 };
        cur.amount += Number(val || 0);
        cur.accounts += 1;
        byMint.set(mint, cur);
      }
    }

    if (!t22?.error) ingest(t22);
    if (!tok?.error) ingest(tok);

    const list = Array.from(byMint.values()).sort((a, b) => b.amount - a.amount);

    // Optional resolve (top 12 to keep it fast)
    const doResolve = req.query.resolve === "1";
    if (doResolve) {
      const top = list.slice(0, 12);
      const syms = await Promise.all(top.map(x => resolveSymbol(x.mint)));
      for (let i = 0; i < top.length; i++) top[i].symbol = syms[i];
    }

    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
    return res.status(200).json({ owner, totalMints: list.length, tokens: list });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
