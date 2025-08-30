// pages/whitepaper.js
import Head from "next/head";

/* ===========================
   CONFIG (safe defaults)
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
    "Dev split funded by site interactions only (no pre-allocation).",
    "Team wallets disclosed post-launch (all bought on-curve).",
  ],
};

export default function WhitepaperPage() {
  return (
    <>
      <Head>
        <title>Crush AI — Whitepaper</title>
        <meta
          name="description"
          content="Crush AI is an on-chain, creator-driven AI companion platform. Xenia is the first Crush model; new models are introduced by community vote."
        />
        <meta property="og:title" content="Crush AI — Whitepaper" />
        <meta
          property="og:description"
          content="Xenia is our first model. Future models are chosen by the community. Read about tiers, governance, and safety."
        />
        <meta property="og:type" content="article" />
      </Head>

      <div className="whitepaper-page">
        {/* HERO */}
        <section className="hero">
          <div className="hero-glow" aria-hidden />
          <h1 className="hero-title">📄 Crush AI — Whitepaper</h1>
          <p className="hero-sub">
            The seductive blueprint for $CRUSH — access, models, governance, and safety 💖
          </p>
          <div className="nav">
            <a href="#overview">Overview</a>
            <a href="#tokenomics">Tokenomics</a>
            <a href="#product">Product</a>
            <a href="#tiers">Tiers</a>
            <a href="#models">Models</a>
            <a href="#governance">Governance</a>
            <a href="#safety">Safety</a>
            <a href="#roadmap">Roadmap</a>
            <a href="#legal">Legal</a>
          </div>
        </section>

        {/* OVERVIEW */}
        <section className="wp-section" id="overview">
          <h2 className="wp-heading">✨ Abstract & Vision</h2>
          <p>
            Crush AI is an on-chain, creator-driven AI companion platform. We combine playful chat
            experiences with transparent economics, tiered access, and community governance.{" "}
            <b>Xenia</b> is our first Crush model; <b>future models are introduced by community
            vote</b>.
          </p>
          <ul className="list left">
            <li>Create flirty, fun companions that feel personal yet safe and consensual.</li>
            <li>Let creators and communities choose which models launch next.</li>
            <li>Use on-chain rails for access, portability, and transparent incentives—not speculation.</li>
          </ul>
        </section>

        {/* TOKENOMICS */}
        <section className="wp-section" id="tokenomics">
          <div className="wp-heading-row">
            <h2 className="wp-heading">💎 Tokenomics</h2>
            <div className="tabs">
              <button className="tab active">Launch (Bonding Curve)</button>
              <button className="tab">Post-Migration</button>
            </div>
          </div>

          <div className="tok-grid">
            <TokCard title="Total Supply" emoji="💠">
              <b>{formatNumber(TOTAL_SUPPLY)}</b> $CRUSH
              <br />
              <small>{DECIMALS} decimals</small>
            </TokCard>

            <TokCard title="Distribution Mechanics" emoji="🌀">
              <b>100% via bonding curve.</b>
              <br />
              All tokens enter the market fairly — no presale or preferential mint.
            </TokCard>

            <TokCard title="Taxes" emoji="🧾">
              <b>0% buy / 0% sell</b>
              <br />
              Pure trading — no hidden fees.
            </TokCard>

            <TokCard title="Team Acquisition" emoji="🤝">
              Team acquires $CRUSH <b>by buying on-curve</b> at public prices.
              <br />
              <i>Wallets disclosed post-launch.</i>
            </TokCard>

            <TokCard title="Dev Split (Earnings Flow)" emoji="🏦">
              No pre-allocation. Dev split earns $CRUSH via <b>site interactions</b> (unlocks, tips,
              premium features).
            </TokCard>

            <TokCard title="Migration & Safety" emoji="🚀">
              On curve completion: <b>auto-liquidity</b>, <b>LP burned</b>, <b>mint authority revoked</b>.
            </TokCard>
          </div>

          {/* Donut visual */}
          <div className="donut-wrap" aria-hidden>
            <div className="donut donut-launch" title="100% bonding curve at launch" />
            <div className="donut-label">Bonding Curve Distribution</div>
          </div>
        </section>

        {/* PRODUCT */}
        <section className="wp-section" id="product">
          <h2 className="wp-heading">🧩 Product Overview</h2>
          <p>
            <b>Core loop:</b> chat → earn XP → unlock content tiers with $CRUSH holdings → vote on the
            future.
          </p>
          <ul className="list left">
            <li>
              <b>Read-only gating</b> (holder check, no per-message signatures).
            </li>
            <li>
              <b>XP + cosmetics</b> for progression and flex.
            </li>
            <li>
              <b>Open governance</b> for models, features, and treasury.
            </li>
          </ul>
        </section>

        {/* TIERS */}
        <section className="wp-section" id="tiers">
          <h2 className="wp-heading">🔓 Unlockable Tiers</h2>
          <div className="tier-grid">
            <Tier title="Tier 1 — Free" emoji="💬" desc="Playful chat, emojis, XP progression." />
            <Tier title="Tier 2 — Supporter" emoji="🔥" desc="Spicier teases, bonus XP multipliers." />
            <Tier title="Tier 3 — VIP" emoji="💎" desc="NSFW galleries, exclusive scenes, priority requests." />
            <Tier title="Tier 4 — Goddess" emoji="👑" desc="Custom AI experiences, early access drops." />
          </div>
          <p className="muted">Note: “Voice notes” are not part of Tier 2.</p>
        </section>

        {/* MODELS */}
        <section className="wp-section" id="models">
          <h2 className="wp-heading">🎭 Models — Xenia First, Community Next</h2>
          <p>
            <b>Xenia</b> is our first Crush AI model. We’ll regularly introduce new models — and the
            <b> community decides who’s next</b>.
          </p>
          <ol className="list left">
            <li>
              <b>Proposal (7 days):</b> creators/community submit a model pitch (persona, sample prompts,
              content boundaries).
            </li>
            <li>
              <b>Demo (7–10 days):</b> a sandbox scene ships for public testing.
            </li>
            <li>
              <b>Vote:</b> holders choose “List / Defer / Reject” (Snapshot/chain). Quorum & thresholds
              published in advance.
            </li>
            <li>
              <b>Launch & metrics:</b> engagement, retention, safety incidents; subject to offboarding vote
              if needed.
            </li>
          </ol>
        </section>

        {/* GOVERNANCE */}
        <section className="wp-section" id="governance">
          <h2 className="wp-heading">🏛️ Governance</h2>
          <ul className="list left">
            <li>
              <b>Phase 1:</b> Snapshot votes (gasless), executed by multisig.
            </li>
            <li>
              <b>Phase 2:</b> On-chain module with time-lock; community proposals past XP/holding threshold.
            </li>
            <li>
              <b>Scope:</b> model onboarding/retirement, tier thresholds, fee splits, treasury grants, safety
              policy updates.
            </li>
            <li>
              <b>Fairness:</b> quadratic caps after a threshold; sybil guard via min holding or verified XP.
            </li>
          </ul>
        </section>

        {/* SAFETY */}
        <section className="wp-section" id="safety">
          <h2 className="wp-heading">🛡️ Safety, Consent & Moderation</h2>
          <ul className="list left">
            <li>
              <b>Content boundaries:</b> each model ships with “allowed/prohibited” rules.
            </li>
            <li>
              <b>Consent & creator rights:</b> creators approve personas and can modify or revoke usage.
            </li>
            <li>
              <b>18+ gating:</b> minors strictly prohibited; regional compliance where required.
            </li>
            <li>
              <b>Abuse controls:</b> rate limits, block/mute, prompt filters, incident response SLAs.
            </li>
            <li>
              <b>Privacy:</b> minimal chat storage for features; users can request deletion.
            </li>
          </ul>
        </section>

        {/* ROADMAP */}
        <section className="wp-section roadmap" id="roadmap">
          <h2 className="wp-heading">🚀 Roadmap</h2>
          <div className="timeline">
            <div className="timeline-item">Phase 0 — Bonding curve launch</div>
            <div className="timeline-item">Phase 1 — Migration → DEX (LP burn, mint revoked)</div>
            <div className="timeline-item">Phase 2 — Tier unlocks + XP leaderboard + NSFW gallery</div>
            <div className="timeline-item">Phase 3 — Creator collabs, premiums, burn events</div>
            <div className="timeline-item">Phase 4 — Mobile app + AI extensions</div>
          </div>
        </section>

        {/* LEGAL */}
        <section className="wp-section" id="legal">
          <h2 className="wp-heading">⚖️ Legal & Disclaimers</h2>
          <ul className="list left">
            <li>
              <b>Utility only:</b> $CRUSH provides access, preferences, and governance; it does not promise
              profit, dividends, or buybacks.
            </li>
            <li>
              <b>No investment advice:</b> do your own research; crypto is volatile.
            </li>
            <li>
              <b>Regulatory risk:</b> features and policies may change to remain compliant.
            </li>
            <li>
              <b>Operational risk:</b> outages or exploits mitigated with audits, bounties, and fallbacks.
            </li>
          </ul>
          <p className="muted">
            Changelog: v0.1 — initial publication; Xenia as first model; community-chosen onboarding;
            utilities & safety baseline.
          </p>
        </section>

        {/* DOWNLOAD (optional: add /public/CrushAI_Whitepaper.pdf) */}
        <section className="wp-section">
          <a href="/CrushAI_Whitepaper.pdf" className="download-btn">
            📥 Download Full Whitepaper (PDF)
          </a>
        </section>

        <style jsx>{`
          .whitepaper-page {
            min-height: 100vh;
            padding: 4rem 1rem 6rem;
            color: #fff;
            text-align: center;
            position: relative;
          }
          .hero {
            margin-bottom: 2.2rem;
            position: relative;
          }
          .hero-glow {
            position: absolute;
            inset: -60px;
            background: radial-gradient(circle, #fa1a81bb, #e098f855 40%, transparent 70%);
            filter: blur(42px);
            z-index: 0;
            animation: pulse 6s ease-in-out infinite;
          }
          .hero-title {
            font-size: 3rem;
            font-weight: 900;
            text-shadow: 0 0 16px #fa1a81cc, 0 0 32px #fff;
            position: relative;
            z-index: 1;
          }
          .hero-sub {
            color: #ffd1ec;
            text-shadow: 0 0 8px #fa1a81aa;
            margin-top: 0.5rem;
            font-size: 1.2rem;
            position: relative;
            z-index: 1;
          }
          .nav {
            margin-top: 1rem;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: center;
            position: relative;
            z-index: 1;
          }
          .nav a {
            padding: 8px 12px;
            border-radius: 999px;
            font-weight: 800;
            color: #fff;
            text-decoration: none;
            border: 1px solid #ffd1ec66;
            background: #ffffff14;
          }
          .nav a:hover {
            background: #ffffff22;
          }

          .wp-section {
            background: linear-gradient(135deg, #ffb6d52c, #e098f824);
            border: 1.6px solid #ffd1ec66;
            border-radius: 18px;
            padding: 2rem;
            margin: 1.6rem auto;
            max-width: 1000px;
            box-shadow: 0 6px 22px #fa1a812e;
            backdrop-filter: blur(6px) saturate(1.05);
            animation: fadeInUp 0.7s ease;
            text-align: left;
          }
          .wp-heading-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
          }
          .wp-heading {
            font-size: 1.8rem;
            text-shadow: 0 0 12px #fa1a81aa;
            margin: 0 0 10px;
          }
          .tabs {
            background: #ffffff14;
            border: 1px solid #ffd1ec66;
            border-radius: 999px;
            padding: 6px;
            display: inline-flex;
            gap: 6px;
          }
          .tab {
            padding: 8px 14px;
            border-radius: 999px;
            font-weight: 800;
            color: #ffd1ec;
            cursor: pointer;
          }
          .tab.active {
            color: #fff;
            background: linear-gradient(135deg, #fa1a81, #e098f8);
            box-shadow: 0 6px 16px #fa1a8166;
          }

          .tok-grid {
            display: grid;
            gap: 12px;
            margin-top: 14px;
          }
          @media (min-width: 720px) {
            .tok-grid {
              grid-template-columns: repeat(3, minmax(0, 1fr));
            }
          }
          .tok-card {
            background: linear-gradient(135deg, #ffb6d52b, #b5fffc22);
            border: 1.6px solid #ffd1ec88;
            border-radius: 16px;
            padding: 16px;
            box-shadow: 0 8px 20px #fa1a8122;
            min-height: 120px;
          }
          .tok-title {
            font-weight: 900;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .donut-wrap {
            margin-top: 18px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
          }
          .donut {
            width: 160px;
            height: 160px;
            border-radius: 999px;
            background: conic-gradient(#ff6aa9 0% 100%);
            box-shadow: 0 6px 24px #fa1a8133, inset 0 0 0 12px #1b0d1b;
            position: relative;
          }
          .donut::after {
            content: "";
            position: absolute;
            inset: 18px;
            border-radius: 999px;
            background: #0f0814cc;
            border: 1px solid #ffd1ec44;
          }
          .donut-label {
            color: #ffd1ec;
            font-size: 0.95rem;
          }

          .tier-grid {
            display: grid;
            gap: 12px;
          }
          @media (min-width: 720px) {
            .tier-grid {
              grid-template-columns: repeat(4, minmax(0, 1fr));
            }
          }
          .tier-card {
            background: linear-gradient(135deg, #ffb6d52b, #b5fffc22);
            border: 1.6px solid #ffd1ec88;
            border-radius: 16px;
            padding: 16px;
            box-shadow: 0 8px 20px #fa1a8122;
            min-height: 120px;
          }
          .tier-title {
            font-weight: 900;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .roadmap .timeline {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            margin-top: 1rem;
          }
          .timeline-item {
            padding: 0.8rem 1rem;
            border-left: 3px solid #fa1a81;
            background: #ffffff12;
            border-radius: 12px;
          }

          .list {
            margin: 0.6rem 0 0;
            padding-left: 1.2rem;
          }
          .list.left {
            text-align: left;
          }
          .list li {
            margin: 0.35rem 0;
          }
          .muted {
            color: #ffd1ec;
            opacity: 0.9;
            margin-top: 0.6rem;
          }

          .download-btn {
            display: inline-block;
            margin-top: 0.4rem;
            padding: 12px 24px;
            border-radius: 14px;
            background: linear-gradient(135deg, #fa1a81, #e098f8);
            font-weight: 800;
            color: #fff;
            box-shadow: 0 6px 18px #fa1a81aa;
            transition: transform 0.15s ease;
          }
          .download-btn:hover {
            transform: translateY(-3px);
          }

          @keyframes pulse {
            0%,
            100% {
              transform: scale(1);
              opacity: 0.85;
            }
            50% {
              transform: scale(1.05);
              opacity: 1;
            }
          }
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(16px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    </>
  );
}

/* Components */
function TokCard({ title, emoji, children }) {
  return (
    <div className="tok-card">
      <div className="tok-title">
        <span>{emoji}</span> {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Tier({ title, emoji, desc }) {
  return (
    <div className="tier-card">
      <div className="tier-title">
        <span>{emoji}</span> {title}
      </div>
      <div>{desc}</div>
    </div>
  );
}

function formatNumber(n) {
  return n.toLocaleString("en-US");
}
