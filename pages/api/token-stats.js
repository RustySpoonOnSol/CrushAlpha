// pages/api/token-stats.js
export const config = { runtime: "nodejs" }; // ✅ Vercel-supported (not "node", not "edge")

const TIMEOUT = 8000;
const UA = { "accept": "application/json", "user-agent": "crush-ai/1.0" };

const DS_TOKENS = (m) => `https://api.dexscreener.com/latest/dex/tokens/${m}`;
const DS_SEARCH = (m) => `https://api.dexscreener.com/latest/dex/search?q=${m}`;
const JUP       = (m) => `https://price.jup.ag/v4/price?ids=${m}`;
const SOLSCAN   = (m) => `https://public-api.solscan.io/token/meta?tokenAddress=${m}`;

// Optional paid fallbacks (add env keys to use):
// Vercel → Project → Settings → Environment Variables
// BIRDEYE_API_KEY, HELIUS_API_KEY
const BE_PRICE  = (m) => `https://api.birdeye.so/defi/price?address=${m}&chain=solana`;
const BE_OVERV  = (m) => `https://api.birdeye.so/defi/token_overview?address=${m}&chain=solana`;
const HEL_PRICE = (m, k) => `https://api.helius.xyz/v0/tokens/price?ids=${m}&api-key=${k}`;

const withTimeout = (p, ms = TIMEOUT) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

const pickBestPair = (pairs = []) =>
  (Array.isArray(pairs) ? pairs : [])
    .slice()
    .sort((a, b) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0))[0];

async function dsTokens(mint) {
  try {
    const r = await withTimeout(fetch(DS_TOKENS(mint), { headers: UA }));
    if (!r.ok) throw new Error("ds tokens bad status");
    const j = await r.json();
    return j?.pairs || [];
  } catch { return []; }
}
async function dsSearch(mint) {
  try {
    const r = await withTimeout(fetch(DS_SEARCH(mint), { headers: UA }));
    if (!r.ok) throw new Error("ds search bad status");
    const j = await r.json();
    const all = j?.pairs || [];
    return all.filter(
      (p) =>
        p?.baseToken?.address?.toLowerCase() === mint.toLowerCase() ||
        p?.quoteToken?.address?.toLowerCase() === mint.toLowerCase()
    );
  } catch { return []; }
}

async function jupiterPrice(mint) {
  try {
    const r = await withTimeout(fetch(JUP(mint), { headers: UA }));
    if (!r.ok) return undefined;
    const j = await r.json();
    const p = j?.data?.[mint]?.price;
    return Number.isFinite(Number(p)) ? Number(p) : undefined;
  } catch { return undefined; }
}

// Optional: Birdeye (needs BIRDEYE_API_KEY)
async function birdeyePrice(mint) {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return { price: undefined, liquidity: undefined, trace: "no-key" };
  const H = { ...UA, "X-API-KEY": key };

  let price, liquidity, trace = "ok";
  try {
    const r = await withTimeout(fetch(BE_PRICE(mint), { headers: H }));
    const j = await r.json();
    price = Number(j?.data?.value ?? j?.data?.price);
  } catch { trace = "price-fail"; }

  try {
    const r2 = await withTimeout(fetch(BE_OVERV(mint), { headers: H }));
    const j2 = await r2.json();
    liquidity = Number(j2?.data?.liquidity ?? j2?.data?.liquidity_usd ?? j2?.data?.liquidityUSD);
  } catch { trace += "|liq-fail"; }

  return {
    price: Number.isFinite(price) ? price : undefined,
    liquidity: Number.isFinite(liquidity) ? liquidity : undefined,
    trace
  };
}

// Optional: Helius price (needs HELIUS_API_KEY)
async function heliusPrice(mint) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return { price: undefined, trace: "no-key" };
  try {
    const r = await withTimeout(fetch(HEL_PRICE(mint, key), { headers: UA }));
    if (!r.ok) return { price: undefined, trace: "bad-status" };
    const j = await r.json();
    // Accept either array or object shape
    const p = Array.isArray(j) ? j.find((x) => x?.id === mint)?.price : j?.[mint]?.price;
    return { price: Number.isFinite(Number(p)) ? Number(p) : undefined, trace: "ok" };
  } catch { return { price: undefined, trace: "fail" }; }
}

async function tokenSupply(mint) {
  const primary = process.env.SOLANA_RPC_PRIMARY || "https://api.mainnet-beta.solana.com";
  const fallback = process.env.SOLANA_RPC_FALLBACK || primary;
  const payload = (id) => ({ jsonrpc: "2.0", id, method: "getTokenSupply", params: [mint] });

  async function call(url) {
    const r = await withTimeout(fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
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
      const r = await withTimeout(fetch(SOLSCAN(mint), { headers: UA }));
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
  const debug = req.query.debug === "1";
  if (!mint) return res.status(400).json({ error: "missing mint" });

  const trace = [];
  try {
    // Dexscreener
    let pairs = await dsTokens(mint);
    trace.push({ step: "dsTokens", count: pairs.length });

    if (!pairs.length) {
      const found = await dsSearch(mint);
      trace.push({ step: "dsSearch", count: found.length });
      pairs = found;
    }

    const best = pickBestPair(pairs);
    trace.push({ step: "pickBest", ok: !!best, pairAddress: best?.pairAddress });

    let priceUsd = best?.priceUsd ? Number(best.priceUsd) : undefined;
    let liquidityUsd = Number.isFinite(Number(best?.liquidity?.usd)) ? Number(best.liquidity.usd) : undefined;
    let marketCapUsd = Number.isFinite(Number(best?.marketCap)) ? Number(best.marketCap) : undefined; // 🚫 never FDV
    const pairUrl = best?.url || (best?.pairAddress ? `https://dexscreener.com/solana/${best.pairAddress}` : null);

    // Jupiter price fallback
    if (!Number.isFinite(priceUsd)) {
      const jup = await jupiterPrice(mint);
      trace.push({ step: "jupiterPrice", ok: Number.isFinite(jup) });
      if (Number.isFinite(jup)) priceUsd = jup;
    }

    // Optional Birdeye
    if (!Number.isFinite(priceUsd) || !Number.isFinite(liquidityUsd)) {
      const be = await birdeyePrice(mint);
      trace.push({ step: "birdeye", ...be, used: !!(be.price || be.liquidity) });
      if (!Number.isFinite(priceUsd)   && Number.isFinite(be.price))     priceUsd = be.price;
      if (!Number.isFinite(liquidityUsd) && Number.isFinite(be.liquidity)) liquidityUsd = be.liquidity;
    }

    // Optional Helius price
    if (!Number.isFinite(priceUsd)) {
      const hp = await heliusPrice(mint);
      trace.push({ step: "heliusPrice", ...hp, used: Number.isFinite(hp.price) });
      if (Number.isFinite(hp.price)) priceUsd = hp.price;
    }

    // MC via supply × price when missing
    if (!Number.isFinite(marketCapUsd) && Number.isFinite(priceUsd)) {
      const supply = await tokenSupply(mint);
      trace.push({ step: "tokenSupply", ok: Number.isFinite(supply) });
      if (Number.isFinite(supply)) marketCapUsd = priceUsd * supply;
    }

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    res.status(200).json({
      mint,
      priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
      marketCapUsd: Number.isFinite(marketCapUsd) ? marketCapUsd : null,
      liquidityUsd: Number.isFinite(liquidityUsd) ? liquidityUsd : null,
      pairUrl,
      source: {
        price: best?.priceUsd ? "dexscreener" :
               (Number.isFinite(priceUsd) ? "fallback" : "none"),
        mc: best?.marketCap ? "dexscreener" :
            (Number.isFinite(marketCapUsd) ? "estimated" : "none"),
        liq: best?.liquidity?.usd ? "dexscreener" :
             (Number.isFinite(liquidityUsd) ? "fallback" : "none")
      },
      ...(debug ? { debug: trace } : {}),
    });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=5");
    res.status(200).json({
      mint, priceUsd: null, marketCapUsd: null, liquidityUsd: null, pairUrl: null,
      error: "unavailable", ...(debug ? { debug: trace, message: String(e) } : {}),
    });
  }
}
