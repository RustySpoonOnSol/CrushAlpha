import { useState, useEffect } from "react";

/* ===========================
   CONFIG (safe defaults, no wallet exposure)
   =========================== */

const TOTAL_SUPPLY = 1_000_000_000; // 1B $CRUSH
const DECIMALS = 6;

const POST_MIGRATION = {
  circulatingPct: 97,
  communityPct: 2,
  opsPct: 1,
  tax: "0 / 0",
  notes: [
    "LP burned and mint authority revoked.",
    "0% buy/sell tax in perpetuity.",
    "Dev split is funded by site interactions only (no pre-allocation).",
    "Team wallets will be disclosed after launch (all bought on-curve).",
  ],
};

export default function WhitepaperPage() {
  const [tab, setTab] = useState("launch");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="whitepaper-page">
      {/* HERO */}
      <section className="hero">
        <div className="hero-glow" aria-hidden />
        <h1 className="hero-title">📄 Crush AI — Whitepaper</h1>
        <p className="hero-sub">The seductive blueprint for $CRUSH on Pump.fun 💖</p>
      </section>

      {/* TOKENOMICS */}
      <section className="wp-section">
        <div className="wp-heading-row">
          <h2 className="wp-heading">💎 Tokenomics</h2>
          <div className="tabs">
            <button
              className={`tab ${tab === "launch" ? "active" : ""}`}
              onClick={() => setTab("launch")}
            >
              Launch (Pump.fun)
            </button>
            <button
              className={`tab ${tab === "post" ? "active" : ""}`}
              onClick={() => setTab("post")}
            >
              Post-Migration (Raydium)
            </button>
          </div>
        </div>

        {tab === "launch" ? (
          <div className="tok-grid">
            <TokCard title="Total Supply" emoji="💠">
              <b>{formatNumber(TOTAL_SUPPLY)}</b> $CRUSH<br />
              <small>{DECIMALS} decimals</small>
            </TokCard>

            <TokCard title="Distribution Mechanics" emoji="🌀">
              <b>100% via Pump.fun bonding curve.</b><br />
              All tokens enter the market fairly — no presale or preferential mint.
            </TokCard>

            <TokCard title="Taxes" emoji="🧾">
              <b>0% buy / 0% sell</b><br />
              Pure trading — no hidden fees.
            </TokCard>

            <TokCard title="Team Acquisition" emoji="🤝">
              Team acquires $CRUSH <b>by buying on-curve</b> at public prices.<br />
              <i>Wallets will be disclosed after launch.</i>
            </TokCard>

            <TokCard title="Dev Split (Earnings Flow)" emoji="🏦">
              No pre-allocation. Dev split earns $CRUSH only through <b>site interactions</b> 
              (unlocks, tips, premium features).<br />
              <i>Dev & personal wallet addresses will be disclosed post-launch.</i>
            </TokCard>

            <TokCard title="Migration & Safety" emoji="🚀">
              Once the curve completes, liquidity is <b>auto-added to Raydium</b>,<br />
              <b>LP is burned</b>, and <b>mint authority revoked</b>.
            </TokCard>
          </div>
        ) : (
          <div className="tok-grid">
            <TokCard title="Supply Status" emoji="📊">
              <b>{POST_MIGRATION.circulatingPct}%</b> Circulating Float<br />
              <b>{POST_MIGRATION.communityPct}%</b> Community Incentives<br />
              <b>{POST_MIGRATION.opsPct}%</b> Ops & Listings
            </TokCard>

            <TokCard title="LP & Mint" emoji="🔥">
              LP <b>burned</b> • Mint authority <b>revoked</b> • Freeze disabled.
            </TokCard>

            <TokCard title="Taxes" emoji="🧾">
              Permanent <b>{POST_MIGRATION.tax}</b> tax.
            </TokCard>

            <TokCard title="Treasury Policy" emoji="🔐">
              Any treasury/creator funds are <b>time-locked</b>, <b>multisig-gated</b>, and reported.<br />
              Buybacks/burns announced publicly.
            </TokCard>

            <TokCard title="Notes" emoji="📝">
              <ul className="list">
                {POST_MIGRATION.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </TokCard>
          </div>
        )}

        {/* Donut visual */}
        <div className="donut-wrap" aria-hidden>
          {tab === "launch" ? (
            <div className="donut donut-launch" title="100% bonding curve at launch" />
          ) : (
            <div
              className="donut donut-post"
              style={{
                background: `conic-gradient(
                  #ff6aa9 ${POST_MIGRATION.circulatingPct}%,
                  #b5fffc ${POST_MIGRATION.circulatingPct}% ${POST_MIGRATION.circulatingPct + POST_MIGRATION.communityPct}%,
                  #e098f8 ${POST_MIGRATION.circulatingPct + POST_MIGRATION.communityPct}% 100%
                )`,
              }}
              title="Post-migration split"
            />
          )}
          <div className="donut-label">
            {tab === "launch" ? "Bonding Curve Distribution" : "Circulating / Community / Ops"}
          </div>
        </div>
      </section>

      {/* LEVELS */}
      <section className="wp-section">
        <h2 className="wp-heading">💋 XP & Flirt Levels</h2>
        <p>
          Earn XP with every message to Xenia and climb from <b>Flirt Rookie</b> to <b>Crush Master</b>.
          Higher levels boost your standing on the leaderboard and unlock extras.
        </p>
      </section>

      {/* TIERS */}
      <section className="wp-section">
        <h2 className="wp-heading">🔓 Unlockable Tiers</h2>
        <p>
          Holding more $CRUSH unlocks hotter experiences — from playful teases to XXX-exclusive content,
          custom scenes, and priority requests.
        </p>
      </section>

      {/* ROADMAP */}
      <section className="wp-section roadmap">
        <h2 className="wp-heading">🚀 Roadmap</h2>
        <div className="timeline">
          <div className="timeline-item">Phase 0 — Pump.fun launch & bonding curve</div>
          <div className="timeline-item">Phase 1 — Auto-migration → Raydium (LP burn, mint revoked)</div>
          <div className="timeline-item">Phase 2 — Tier unlocks + XP leaderboard + NSFW gallery</div>
          <div className="timeline-item">Phase 3 — Creator collabs, premiums, burn events</div>
          <div className="timeline-item">Phase 4 — Mobile app + AI extensions</div>
        </div>
      </section>

      {/* DOWNLOAD */}
      <section className="wp-section">
        <a href="/CrushAI_Whitepaper.pdf" className="download-btn">📥 Download Full Whitepaper</a>
      </section>

      <style jsx>{`
        .whitepaper-page {
          min-height: 100vh;
          padding: 4rem 1rem 6rem;
          color: #fff;
          text-align: center;
          position: relative;
        }
        .hero { margin-bottom: 3rem; position: relative; }
        .hero-glow {
          position: absolute; inset: -60px;
          background: radial-gradient(circle, #fa1a81bb, #e098f855 40%, transparent 70%);
          filter: blur(42px); z-index: 0; animation: pulse 6s ease-in-out infinite;
        }
        .hero-title { font-size: 3rem; font-weight: 900; text-shadow: 0 0 16px #fa1a81cc, 0 0 32px #fff; }
        .hero-sub { color: #ffd1ec; text-shadow: 0 0 8px #fa1a81aa; margin-top: .5rem; font-size: 1.2rem; }

        .wp-section {
          background: linear-gradient(135deg, #ffb6d52c, #e098f824);
          border: 1.6px solid #ffd1ec66;
          border-radius: 18px;
          padding: 2rem;
          margin: 2rem auto;
          max-width: 1000px;
          box-shadow: 0 6px 22px #fa1a812e;
          backdrop-filter: blur(6px) saturate(1.05);
          animation: fadeInUp 0.7s ease;
        }
        .wp-heading-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .wp-heading { font-size: 1.8rem; text-shadow: 0 0 12px #fa1a81aa; }
        .tabs { background: #ffffff14; border: 1px solid #ffd1ec66; border-radius: 999px; padding: 6px; display: inline-flex; gap: 6px; }
        .tab { padding: 8px 14px; border-radius: 999px; font-weight: 800; color: #ffd1ec; cursor: pointer; }
        .tab.active { color: #fff; background: linear-gradient(135deg, #fa1a81, #e098f8); box-shadow: 0 6px 16px #fa1a8166; }

        .tok-grid { display: grid; gap: 12px; margin-top: 14px; }
        @media (min-width: 720px) { .tok-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        .tok-card { background: linear-gradient(135deg, #ffb6d52b, #b5fffc22); border: 1.6px solid #ffd1ec88; border-radius: 16px; padding: 16px; box-shadow: 0 8px 20px #fa1a8122; min-height: 120px; }
        .tok-title { font-weight: 900; margin-bottom: 6px; display:flex; align-items:center; gap:8px; }

        .donut-wrap { margin-top: 18px; display:flex; flex-direction:column; align-items:center; gap:8px; }
        .donut { width: 160px; height: 160px; border-radius: 999px; background: conic-gradient(#ff6aa9 0% 100%); box-shadow: 0 6px 24px #fa1a8133, inset 0 0 0 12px #1b0d1b; position: relative; }
        .donut::after { content: ""; position: absolute; inset: 18px; border-radius: 999px; background: #0f0814cc; border: 1px solid #ffd1ec44; }
        .donut-label { color:#ffd1ec; font-size:.95rem; }

        .roadmap .timeline { display:flex; flex-direction:column; gap:1rem; margin-top: 1rem; }
        .timeline-item { padding: .8rem 1rem; border-left: 3px solid #fa1a81; text-align: left; margin-left: 40%; background: #ffffff12; border-radius: 12px; }

        .download-btn { display: inline-block; margin-top: 1rem; padding: 12px 24px; border-radius: 14px; background: linear-gradient(135deg, #fa1a81, #e098f8); font-weight: 800; color: #fff; box-shadow: 0 6px 18px #fa1a81aa; transition: transform .15s ease; }
        .download-btn:hover { transform: translateY(-3px); }

        @keyframes pulse { 0%,100% { transform: scale(1); opacity:.85; } 50% { transform: scale(1.05); opacity:1; } }
        @keyframes fadeInUp { from { opacity:0; transform: translateY(16px);} to { opacity:1; transform: translateY(0);} }
      `}</style>
    </div>
  );
}

/* Components */
function TokCard({ title, emoji, children }) {
  return (
    <div className="tok-card">
      <div className="tok-title"><span>{emoji}</span> {title}</div>
      <div>{children}</div>
    </div>
  );
}

function formatNumber(n) {
  return n.toLocaleString("en-US");
}
