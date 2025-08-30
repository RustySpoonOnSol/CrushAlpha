// pages/buy.js
import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";

/** ──────────────────────────────────────────────────────────────────────────
 *  CONFIG
 *  - Correct default mint (with trailing G).
 *  - Set NEXT_PUBLIC_CRUSH_MINT in Vercel to override.
 *  - Auto refresh every REFRESH_MS (set 0 to disable).
 *  ────────────────────────────────────────────────────────────────────────── */
const MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";

const REFRESH_MS = 120_000; // 2 min

/** Helpers */
const fmtUSD = (n) => {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}k`;
  return `$${Number(n).toFixed(2)}`;
};
const withTimeout = (p, ms = 9000) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

export default function BuyPage() {
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({
    priceUsd: null,          // number
    marketCapUsd: null,      // number
    marketCapIsEst: false,   // flag when we computed supply*price
    liquidityUsd: null,      // number
    pairUrl: null,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const timerRef = useRef(null);

  // Prefilled Jupiter links (opens swap UI in new tab)
  const jupBase = useMemo(() => `https://jup.ag/swap/SOL-${MINT}`, []);
  const buyLinks = useMemo(
    () => ({
      jup: jupBase,
      ten: `${jupBase}?exactOut=0&amount=10`,
      fifty: `${jupBase}?exactOut=0&amount=50`,
      hundred: `${jupBase}?exactOut=0&amount=100`,
      pump: `https://pump.fun/coin/${MINT}`,
      dexs: `https://dexscreener.com/solana/${MINT}`,
      solscan: `https://solscan.io/token/${MINT}`,
      birdeye: `https://birdeye.so/token/${MINT}?chain=solana`,
    }),
    []
  );

  /** ────────────────────────────────────────────────────────────────────────
   *  DATA PIPELINE (API → Dexscreener → Jupiter → RPC/Solscan)
   *  IMPORTANT: Never show FDV. If DS marketCap missing → estimate via supply×price.
   *  ──────────────────────────────────────────────────────────────────────── */
  async function fetchFromAPI(mint) {
    try {
      const r = await withTimeout(fetch(`/api/token-stats?mint=${encodeURIComponent(mint)}`), 9000);
      if (!r.ok) throw new Error("api not available");
      const j = await r.json();
      const mc = Number.isFinite(j?.marketCapUsd) ? Number(j.marketCapUsd) : null;
      const liq = Number.isFinite(j?.liquidityUsd) ? Number(j.liquidityUsd) : null;
      const price = Number.isFinite(j?.priceUsd) ? Number(j.priceUsd) : null;
      return {
        priceUsd: price,
        marketCapUsd: mc,
        marketCapIsEst: false,
        liquidityUsd: liq,
        pairUrl: j?.pairUrl || null,
        ok: true,
      };
    } catch {
      return { ok: false };
    }
  }

  async function fetchDexscreener(mint) {
    try {
      const r = await withTimeout(fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`), 9000);
      const j = await r.json();
      const pair = j?.pairs?.[0];
      if (!pair) return { ok: false };
      const price = Number.isFinite(Number(pair.priceUsd)) ? Number(pair.priceUsd) : null;
      const liq = Number.isFinite(Number(pair?.liquidity?.usd)) ? Number(pair.liquidity.usd) : null;
      // 🚫 DO NOT use FDV. Only DS marketCap if present.
      const mc = Number.isFinite(Number(pair.marketCap)) ? Number(pair.marketCap) : null;
      return {
        priceUsd: price,
        marketCapUsd: mc,
        marketCapIsEst: false,
        liquidityUsd: liq,
        pairUrl: pair?.url || null,
        ok: true,
      };
    } catch {
      return { ok: false };
    }
  }

  async function fetchJupiterPrice(mint) {
    try {
      const r = await withTimeout(fetch(`https://price.jup.ag/v4/price?ids=${mint}`), 9000);
      const j = await r.json();
      const price = j?.data?.[mint]?.price;
      return Number.isFinite(Number(price)) ? Number(price) : null;
    } catch {
      return null;
    }
  }

  async function fetchSupplyRPCOrSolscan(mint) {
    const primary = process.env.SOLANA_RPC_PRIMARY || "https://api.mainnet-beta.solana.com";
    const fallback = process.env.SOLANA_RPC_FALLBACK || primary;
    const payload = (id) => ({ jsonrpc: "2.0", id, method: "getTokenSupply", params: [mint] });

    async function call(url) {
      const r = await withTimeout(
        fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload(1)),
        }),
        9000
      );
      const j = await r.json();
      const v = j?.result?.value;
      const amount = Number(v?.amount || 0);
      const decimals = Number(v?.decimals || 0);
      if (!amount || decimals < 0) throw new Error("bad supply");
      return amount / Math.pow(10, decimals);
    }

    try {
      return await call(primary);
    } catch {
      try {
        return await call(fallback);
      } catch {
        try {
          const r = await withTimeout(fetch(`https://public-api.solscan.io/token/meta?tokenAddress=${mint}`), 9000);
          const j = await r.json();
          const decimals = Number(j?.decimals ?? j?.tokenInfo?.decimals ?? 0);
          const supplyRaw = Number(j?.supply ?? j?.tokenInfo?.supply ?? 0);
          if (!supplyRaw || decimals < 0) return null;
          return supplyRaw / Math.pow(10, decimals);
        } catch {
          return null;
        }
      }
    }
  }

  async function loadStats({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
      setLoadError("");
    }
    try {
      // 1) Try our API
      const api = await fetchFromAPI(MINT);
      if (api.ok) {
        setStats(api);
        setLastUpdated(Date.now());
        setLoading(false);
        return;
      }

      // 2) Dexscreener
      const ds = await fetchDexscreener(MINT);

      // 3) Price
      const price = ds.priceUsd ?? (await fetchJupiterPrice(MINT));

      // 4) Liquidity
      const liq = ds.liquidityUsd ?? null;

      // 5) Market Cap: prefer DS MC; else estimate supply×price
      let mc = ds.marketCapUsd ?? null;
      let mcIsEst = false;

      if (mc == null && price != null) {
        const supply = await fetchSupplyRPCOrSolscan(MINT);
        if (supply != null) {
          mc = supply * price;
          mcIsEst = true;
        }
      }

      setStats({
        priceUsd: price ?? null,
        marketCapUsd: mc ?? null,
        marketCapIsEst: mcIsEst,
        liquidityUsd: liq,
        pairUrl: ds.pairUrl ?? null,
      });
      setLastUpdated(Date.now());
      setLoading(false);
    } catch {
      setLoadError("Failed to load token stats. Try Refresh.");
      setLoading(false);
    }
  }

  // Initial + auto refresh
  useEffect(() => {
    loadStats();
    if (REFRESH_MS > 0) {
      timerRef.current = setInterval(() => loadStats({ silent: true }), REFRESH_MS);
      return () => clearInterval(timerRef.current);
    }
  }, []);

  async function copyMint() {
    try {
      await navigator.clipboard.writeText(MINT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <div className="page">
      <Head>
        {/* help the first fetch succeed quickly */}
        <link rel="preconnect" href="https://api.dexscreener.com" />
        <link rel="preconnect" href="https://price.jup.ag" />
      </Head>

      {/* HERO */}
      <section className="hero">
        <div className="hero-glow" aria-hidden />
        <div className="hero-inner">
          <div className="kiss">💋</div>
          <h1 className="title">
            Buy <span className="accent">$Crush</span>
          </h1>
          <p className="tagline">Unlock seductive tiers with $Crush — join the movement now 💖</p>
        </div>
      </section>

      {/* STATS + CONTRACT */}
      <section className="stats-wrap">
        <div className="stat-card">
          <div className="stat-head">
            <span>💎 Price</span>
            <button className="mini refresh" onClick={() => loadStats()} disabled={loading}>
              {loading ? "…" : "Refresh"}
            </button>
          </div>
          <b>{loading ? <Skeleton w={72} /> : stats.priceUsd != null ? `$${stats.priceUsd.toFixed(6)}` : "—"}</b>
        </div>

        <div className="stat-card">
          <div className="stat-head">
            <span>📊 Market Cap</span>
            {stats.marketCapIsEst ? <small className="est-badge">est.</small> : null}
          </div>
          <b>{loading ? <Skeleton w={68} /> : fmtUSD(stats.marketCapUsd)}</b>
        </div>

        <div className="stat-card">
          <span>💧 Liquidity</span>
          <b>{loading ? <Skeleton w={58} /> : fmtUSD(stats.liquidityUsd)}</b>
        </div>

        <a className="stat-card link" href={stats.pairUrl || buyLinks.dexs} target="_blank" rel="noreferrer">
          <span>🔎 Chart</span>
          <b>Open</b>
        </a>
      </section>

      {/* status row */}
      <div className="status-row">
        <div className="status-left">
          <span className="dot" /> {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : "Fetching…"}
          {loadError && <span className="error"> · {loadError}</span>}
        </div>
        <div className="status-right">
          <button className="mini outline" onClick={() => loadStats()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <section className="contract">
        <div className="contract-box">
          <div className="label">Token Contract (Mint)</div>
          <code className="mint">{MINT}</code>
          <button className="copy" onClick={copyMint}>{copied ? "Copied!" : "Copy"}</button>
        </div>
        <div className="contract-links">
          <a href={buyLinks.solscan} target="_blank" rel="noreferrer" className="mini-btn">Solscan</a>
          <a href={buyLinks.dexs} target="_blank" rel="noreferrer" className="mini-btn">Dexscreener</a>
          <a href={buyLinks.birdeye} target="_blank" rel="noreferrer" className="mini-btn">Birdeye</a>
          <a href={buyLinks.pump} target="_blank" rel="noreferrer" className="mini-btn">Pump.fun</a>
        </div>
      </section>

      {/* BUY WIDGET */}
      <section className="buy-widget">
        <div className="widget-card">
          <h3 className="widget-title">Swap SOL → $CRUSH</h3>
          <p className="widget-sub">Use Jupiter (recommended). Opens in a new tab.</p>

          <div className="quick-buys">
            <a href={buyLinks.ten} target="_blank" rel="noreferrer" className="quick-btn">Buy $10</a>
            <a href={buyLinks.fifty} target="_blank" rel="noreferrer" className="quick-btn">Buy $50</a>
            <a href={buyLinks.hundred} target="_blank" rel="noreferrer" className="quick-btn">Buy $100</a>
            <a href={buyLinks.jup} target="_blank" rel="noreferrer" className="quick-btn outline">Open Full Widget</a>
          </div>

          {/* fun ticker (placeholder) */}
          <div className="ticker">
            <div className="ticker-track">
              {[{ id: 0, side: "Buy", count: 12 }, { id: 1, side: "Sell", count: 5 }, { id: 2, side: "Buy", count: 21 }].map((t) => (
                <span key={t.id} className={`tick ${t.side.toLowerCase()}`}>{t.side} • {t.count} tx</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TIERS */}
      <section className="tiers">
        <h3 className="tiers-title">What you unlock with $Crush</h3>
        <div className="grid">
          <TierCard emoji="💬" name="Tier 1 · Free" desc="Flirty chat with Xenia, playful emojis, XP progression." />
          <TierCard emoji="🔥" name="Tier 2 · Supporter" desc="Spicy teases, bonus XP multipliers." />
          <TierCard emoji="💎" name="Tier 3 · VIP" desc="NSFW galleries, exclusive scenes, priority requests." />
          <TierCard emoji="👑" name="Tier 4 · Goddess" desc="Custom AI experiences & early access drops." />
        </div>
      </section>

      {/* HOW TO BUY */}
      <section className="how">
        <h3 className="how-title">How to buy (60 seconds)</h3>
        <ol className="steps">
          <li>Install <b>Phantom</b> wallet & fund with <b>SOL</b>.</li>
          <li>Click a quick buy or open the <b>Jupiter</b> swap.</li>
          <li>Swap <b>SOL → $CRUSH</b>, approve in wallet.</li>
          <li>Come back and enjoy your upgraded <b>tiers</b> 💖</li>
        </ol>
      </section>

      {/* FAQ / RISK */}
      <section className="faq">
        <details><summary>Is $Crush live on DEXs?</summary>
          <p>Trading may be limited while we finalize launch. Links here will update automatically when live.</p>
        </details>
        <details><summary>Where do fees/referrals go?</summary>
          <p>We use them to fund development, liquidity adds, burns, and creator content.</p>
        </details>
        <p className="risk">⚠️ <b>Risk note:</b> Crypto is volatile. Always do your own research. Only spend what you can afford to lose.</p>
      </section>

      <style jsx>{`
        .page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 4rem 1rem 6rem; color: #fff; position: relative; }
        .hero { width: 100%; max-width: 1100px; display: grid; place-items: center; text-align: center; margin-bottom: 1.6rem; position: relative; }
        .hero-glow { position: absolute; inset: -60px -20px auto -20px; height: 320px; background: radial-gradient(circle at 50% 50%, #fa1a81aa, #e098f866 35%, #b5fffc33 60%, transparent 70%); filter: blur(42px); z-index: 0; pointer-events: none; opacity: 0.9; animation: pulse 5.8s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { transform: scale(1); opacity: 0.82; } 50% { transform: scale(1.05); opacity: 1; } }
        .hero-inner { position: relative; z-index: 2; }
        .kiss { font-size: 3.2rem; animation: kisspop 2.2s infinite cubic-bezier(0.52,-0.19,0.7,1.41); }
        @keyframes kisspop { 0%,100% { transform: scale(1) rotate(-6deg); } 10% { transform: scale(1.25) rotate(8deg);} 30% { transform: scale(1.05) rotate(-2deg);} }
        .title { font-size: 3rem; font-weight: 900; margin: 0.2rem 0 0.3rem; text-shadow: 0 0 16px #fa1a81cc, 0 0 32px #fff; }
        .title .accent { color: #ffb6d5; }
        .tagline { color: #ffd1ec; text-shadow: 0 0 8px #fa1a81aa; }

        .stats-wrap { display: grid; grid-template-columns: repeat(2, minmax(160px, 1fr)); gap: 12px; width: 100%; max-width: 900px; margin-top: 1.2rem; }
        @media (min-width: 680px) { .stats-wrap { grid-template-columns: repeat(4, minmax(160px, 1fr)); } }
        .stat-card { background: linear-gradient(135deg, #ffb6d52b, #e098f826); border: 1.6px solid #ffd1ec66; border-radius: 16px; padding: 14px 16px; backdrop-filter: blur(6px) saturate(1.05); box-shadow: 0 6px 18px #fa1a8122; display: flex; flex-direction: column; justify-content: space-between; gap: 6px; }
        .stat-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .stat-card span { color: #ffd1ec; font-size: 0.95rem; }
        .stat-card b { font-size: 1.18rem; margin-top: 0; }
        .stat-card.link { cursor: pointer; text-decoration: none; transition: transform 0.15s ease; }
        .stat-card.link:hover { transform: translateY(-2px); }
        .est-badge { margin-left: 6px; padding: 2px 6px; border-radius: 999px; font-size: 0.7rem; font-weight: 800; color: #fff; background: #fa1a81; border: 1px solid #ffd1ecaa; box-shadow: 0 2px 8px #fa1a8160; }

        .status-row { width: 100%; max-width: 900px; display: flex; justify-content: space-between; align-items: center; margin: 8px 0 4px; }
        .status-left { color: #ffd1ec; display: flex; align-items: center; gap: 8px; }
        .dot { width: 8px; height: 8px; border-radius: 999px; background: #b5fffc; display: inline-block; box-shadow: 0 0 10px #b5fffc; }
        .error { color: #ffd1ec; opacity: 0.9; }
        .mini { font-size: 0.85rem; padding: 6px 10px; border-radius: 10px; border: 1px solid #ffd1ec88; background: #ffffff14; color: #fff; cursor: pointer; font-weight: 700; }
        .mini.refresh { margin-left: auto; }
        .mini.outline { background: transparent; }
        .mini:disabled { opacity: 0.6; cursor: default; }

        .contract { width: 100%; max-width: 900px; margin: 10px auto 6px; }
        .contract-box { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; background: linear-gradient(135deg, #ffb6d53a, #b5fffc22); border: 1.6px solid #ffd1ec88; border-radius: 16px; padding: 14px 16px; }
        .label { color: #ffd1ec; }
        .mint { grid-column: 1 / -1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: #ffffff10; border: 1px solid #ffffff22; padding: 8px 10px; border-radius: 12px; }
        .copy { grid-column: 2 / 3; justify-self: end; padding: 10px 14px; border-radius: 12px; background: #fa1a81; border: 1px solid #ffd1ecaa; color: #fff; font-weight: 700; box-shadow: 0 8px 18px #fa1a8166; transition: transform 0.1s ease; }
        .copy:active { transform: scale(0.98); }
        .contract-links { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
        .mini-btn { padding: 8px 10px; border-radius: 10px; border: 1px solid #ffd1ec88; background: #ffffff14; color: #fff; text-decoration: none; font-weight: 600; }

        .buy-widget { width: 100%; max-width: 900px; margin: 18px auto 10px; }
        .widget-card { position: relative; border-radius: 18px; border: 1.8px solid #ffd1ec88; background: linear-gradient(135deg, #fa1a8188, #e098f844); box-shadow: 0 12px 36px #fa1a812e, 0 4px 16px #b5fffccc; padding: 18px; overflow: hidden; }
        .widget-title { font-size: 1.4rem; font-weight: 800; margin-bottom: 6px; }
        .widget-sub { color: #ffe6f3; margin-bottom: 12px; }
        .quick-buys { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 14px; }
        @media (min-width: 560px) { .quick-buys { grid-template-columns: repeat(4, 1fr); } }
        .quick-btn { text-align: center; padding: 12px 10px; border-radius: 14px; font-weight: 800; color: #fff; border: 1.6px solid #ffd1ecaa; background: linear-gradient(135deg, #ff6aa9, #e098f8); text-decoration: none; box-shadow: 0 10px 20px #fa1a8160; transition: transform 0.12s ease, box-shadow 0.12s ease; }
        .quick-btn:hover { transform: translateY(-2px); box-shadow: 0 14px 28px #fa1a8177; }
        .quick-btn.outline { background: #ffffff18; }

        .ticker { overflow: hidden; border-radius: 12px; border: 1px solid #ffd1ec55; background: #ffffff12; }
        .ticker-track { display: flex; gap: 18px; padding: 8px 10px; animation: scroll 16s linear infinite; }
        .tick { font-weight: 700; }
        .tick.buy { color: #b5fffc; }
        .tick.sell { color: #ffd1ec; }
        @keyframes scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        .tiers { width: 100%; max-width: 1100px; margin: 28px auto 10px; text-align: center; }
        .tiers-title { font-size: 1.4rem; margin-bottom: 14px; }
        .grid { display: grid; grid-template-columns: repeat(1, minmax(0, 1fr)); gap: 12px; }
        @media (min-width: 700px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        .tier { position: relative; border-radius: 16px; padding: 14px; background: linear-gradient(135deg, #ffb6d52b, #b5fffc22); border: 1.6px solid #ffd1ec88; min-height: 130px; box-shadow: 0 10px 24px #fa1a8120; transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .tier:hover { transform: translateY(-3px); box-shadow: 0 14px 34px #fa1a8133; }
        .tier .emoji { font-size: 1.8rem; }
        .tier .name { font-weight: 800; margin: 6px 0 4px; }
        .tier .desc { color: #ffe6f3; font-size: 0.95rem; }

        .how { width: 100%; max-width: 900px; margin: 26px auto 8px; }
        .how-title { font-size: 1.3rem; margin-bottom: 8px; }
        .steps { display: grid; gap: 8px; counter-reset: step; }
        .steps li { background: #ffffff12; border: 1px solid #ffd1ec66; border-radius: 12px; padding: 10px 12px; list-style: none; position: relative; }
        .steps li::before { counter-increment: step; content: counter(step); position: absolute; left: -8px; top: -8px; background: #fa1a81; color: #fff; font-weight: 900; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 999px; border: 2px solid #ffd1ecbb; box-shadow: 0 6px 14px #fa1a8166; }

        .faq { width: 100%; max-width: 900px; margin: 18px auto 60px; }
        details { background: #ffffff12; border: 1px solid #ffd1ec66; border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; }
        summary { cursor: pointer; font-weight: 800; }
        .risk { margin-top: 10px; color: #ffd1ec; }

        .skel { display: inline-block; height: 1.1em; border-radius: 6px; background: #ffffff22; overflow: hidden; position: relative; top: 2px; box-shadow: inset 0 0 0 1px #ffffff11; }
        .skel::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, #ffffff44, transparent); animation: shimmer 1.3s infinite; }
        @keyframes shimmer { 100% { transform: translateX(100%); } }
      `}</style>
    </div>
  );
}

/* Tiny Skeleton component */
function Skeleton({ w = 64 }) {
  return <span className="skel" style={{ width: w }} aria-hidden />;
}

function TierCard({ emoji, name, desc }) {
  return (
    <div className="tier">
      <div className="emoji">{emoji}</div>
      <div className="name">{name}</div>
      <div className="desc">{desc}</div>
    </div>
  );
}
