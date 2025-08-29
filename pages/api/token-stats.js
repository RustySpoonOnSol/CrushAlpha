cat > pages/api/token-stats.js <<'EOF'
// pages/api/token-stats.js
export const config = { runtime: "nodejs" };  // ← fixed

const DS_URL = (mint) => `https://api.dexscreener.com/latest/dex/tokens/${mint}`;
const JUP_URL = (mint) => `https://price.jup.ag/v4/price?ids=${mint}`;
const withTimeout = (p, ms = 8000) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function getDexscreener(mint) {
  try {
    const r = await withTimeout(fetch(DS_URL(mint)));
    if (!r.ok) throw new Error("dexscreener status");
    const j = await r.json();
    const pair = j?.pairs?.[0];
    if (!pair) return {};
    return {
      priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
      marketCapUsd: pair.marketCap ?? pair.fdv,
      liquidityUsd: pair.liquidity?.usd,
      pairUrl: pair.url,
    };
  } catch { return {}; }
}

async function getJupPrice(mint) {
  try {
    const r = await withTimeout(fetch(JUP_URL(mint)));
    if (!r.ok) return undefined;
    const j = await r.json();
    const p = j?.data?.[mint]?.price;
    return p ? Number(p) : undefined;
  } catch { return undefined; }
}

async function getSupplyRPC(mint) {
  const primary = process.env.SOLANA_RPC_PRIMARY || "https://api.mainnet-beta.solana.com";
  const fallback = process.env.SOLANA_RPC_FALLBACK || primary;
  const payload = (id) => ({ jsonrpc: "2.0", id, method: "getTokenSupply", params: [mint] });

  async function call(url) {
    const r = await withTimeout(fetch(url, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload(1)),
    }), 8000);
    const j = await r.json();
    const v = j?.result?.value;
    const amount = Number(v?.amount || 0);
    const decimals = Number(v?.decimals || 0);
    if (!amount || decimals < 0) throw new Error("invalid supply");
    return amount / Math.pow(10, decimals);
  }

  try { return await call(primary); }
  catch { try { return await call(fallback); } catch { return undefined; } }
}

export default async function handler(req, res) {
  const mint = (req.query.mint || process.env.NEXT_PUBLIC_CRUSH_MINT || "").trim();
  if (!mint) return res.status(400).json({ error: "missing mint" });

  const [ds, jup, supply] = await Promise.all([getDexscreener(mint), getJupPrice(mint), getSupplyRPC(mint)]);
  const priceUsd = ds.priceUsd ?? jup;
  const marketCapUsd = ds.marketCapUsd ?? (priceUsd && supply ? priceUsd * supply : undefined);

  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
  res.json({
    mint,
    priceUsd: priceUsd ?? null,
    marketCapUsd: marketCapUsd ?? null,
    liquidityUsd: ds.liquidityUsd ?? null,
    pairUrl: ds.pairUrl ?? null,
  });
}

