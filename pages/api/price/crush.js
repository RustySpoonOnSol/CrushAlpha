// pages/api/price/crush.js
export const config = { runtime: "nodejs" };
const MINT = process.env.NEXT_PUBLIC_CRUSH_MINT || process.env.CRUSH_MINT;

export default async function handler(req, res) {
  try {
    if (!MINT) return res.status(400).json({ error: "Token mint missing" });
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${MINT}`);
    if (!r.ok) return res.status(502).json({ error: "Dexscreener upstream error" });
    const j = await r.json();
    const pair = j?.pairs?.find((p) => p?.priceUsd) || j?.pairs?.[0] || null;
    const price = pair ? Number(pair.priceUsd || pair.priceUsd0 || 0) : 0;
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    res.status(200).json({ price });
  } catch (e) {
    res.status(500).json({ error: "price failed" });
  }
}
