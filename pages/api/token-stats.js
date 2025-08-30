// pages/api/token-stats.js
export const config = { runtime: "nodejs" }; // ✅ supported on Vercel

const DS = (m) => `https://api.dexscreener.com/latest/dex/tokens/${m}`;
const JUP = (m) => `https://price.jup.ag/v4/price?ids=${m}`;
const SOLSCAN = (m) => `https://public-api.solscan.io/token/meta?tokenAddress=${m}`;
const TIMEOUT = 8000;

const withTimeout = (p, ms = TIMEOUT) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function dexscreener(mint) {
  try {
    const r = await withTimeout(fetch(DS(mint)));
    if (!r.ok) throw new Error("ds bad status");
    const j = await r.json();
    const pair = j?.pairs?.[0];
    if (!pair) return {};
    return {
      priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
      // 🚫 never FDV
      marketCapUsd: Number.isFinite(Number(pair.marketCap)) ? Number(pair.marketCap) : undefined,
      liquidityUsd: Number.isFinite(Number(pair?.liquidity?.usd)) ? Number(pair.liquidity.usd) : undefined,
      pairUrl: pair.url || null,
    };
  } catch {
    return {};
  }
}

async function jupiterPrice(mint) {
  try {
    const r = await withTimeout(fetch(JUP(mint)));
    if (!r.ok) return undefined;
    const j = await r.json();
    const p = j?.data?.[mint]?.price;
    return Number.isFinite(Number(p)) ? Number(p) : undefined;
  } catch {
    return undefined;
  }
}

async function tokenSupply(mint) {
  const primary = process.env.SOLANA_RPC_PRIMARY || "https://api.mainnet-beta.solana.com";
  const fallback = process.env.SOLANA_RPC_FALLBACK || primary;
  const payload = (id) => ({ jsonrpc: "2.0", id, method: "getTokenSupply", params: [mint] });

  async function call(url) {
    const r = await withTimeout(fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload(1)),
    }));
    const j = await r.json();
    const v = j?.result?.value;
    const amount = Number(v?.amount || 0);
    const decimals = Number(v?.decimals || 0);
    if (!amount || decimals < 0) throw new Error("bad supply");
    return amount / Math.pow(10, decimals);
  }

  try { return await call(primary); }
  catch { try { return await call(fallback); }
  catch {
    try {
      const r = await withTimeout(fetch(SOLSCAN(mint)));
      const j = await r.json();
      const d = Number(j?.decimals ?? j?.tokenInfo?.decimals ?? 0);
      const raw = Number(j?.supply ?? j?.tokenInfo?.supply ?? 0);
      if (!raw || d < 0) return undefined;
      return raw / Math.pow(10, d);
    } catch { return undefined; }
  }}
}

export default async function handler(req, res) {
  const mint = (req.query.mint || process.env.NEXT_PUBLIC_CRUSH_MINT || "").trim();
  if (!mint) return res.status(400).json({ error: "missing mint" });

  try {
    const ds = await dexscreener(mint);
    const price = ds.priceUsd ?? (await jupiterPrice(mint));

    let marketCap = ds.marketCapUsd;
    if (!marketCap && price) {
      const supply = await tokenSupply(mint);
      if (Number.isFinite(supply)) marketCap = price * supply; // est MC
    }

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    res.status(200).json({
      mint,
      priceUsd: Number.isFinite(price) ? price : null,
      marketCapUsd: Number.isFinite(marketCap) ? marketCap : null,
      liquidityUsd: Number.isFinite(ds.liquidityUsd) ? ds.liquidityUsd : null,
      pairUrl: ds.pairUrl || null,
      source: { price: ds.priceUsd ? "dexscreener" : "jupiter", mc: ds.marketCapUsd ? "dexscreener" : "estimated" }
    });
  } catch {
    res.status(200).json({ mint, priceUsd: null, marketCapUsd: null, liquidityUsd: null, pairUrl: null, error: "unavailable" });
  }
}
