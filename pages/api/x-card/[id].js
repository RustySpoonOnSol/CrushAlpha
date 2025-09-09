// pages/x-card/[id].js
import Head from "next/head";
import { useRouter } from "next/router";

export default function XCardPage() {
  const router = useRouter();
  const { id } = router.query;

  // Incoming params from leaderboard
  const title   = (router.query.title   || "Crush AI").toString();
  const name    = (router.query.name    || id || "Anonymous").toString();
  const xp      = Number(router.query.xp || 0);
  const rank    = (router.query.rank    || "?").toString();
  const pct     = (router.query.pct     || "Top 100%").toString();
  const tagline = (router.query.tagline || "Chat. Flirt. Climb.").toString();
  const center  = router.query.center === "1";
  const compact = router.query.compact === "1";
  const bg      = (router.query.bg || "/brand/x-banner.png").toString(); // root-absolute PNG
  const hideWm  = router.query.wm === "0";

  return (
    <>
      <Head>
        <title>{title} — Card</title>
        <meta name="robots" content="noindex" />
        <link rel="preload" as="image" href="/brand/x-banner.png" />
      </Head>

      <main className="card-wrap">
        <div className="card" role="img" aria-label={`${title} card for ${name}`}>
          {/* background */}
          <img src={bg} alt="" className="bg" />

          {/* overlays */}
          <div className="shade" />
          <div className="glow" />

          {/* content */}
          <div className={`content ${center ? "center" : ""} ${compact ? "compact" : ""}`}>
            <div className="title">{title}</div>
            <div className="bar" />
            <div className="who">{name}</div>
            <div className="chips">
              <div className="chip"><span className="k">XP:</span><span className="v">{xp.toLocaleString()}</span></div>
              <div className="chip"><span className="k">Rank:</span><span className="v">#{rank}</span></div>
              <div className="chip"><span className="k">Percentile:</span><span className="v">{pct}</span></div>
            </div>
            <div className="tagline">{tagline}</div>
          </div>

          {!hideWm && (
            <div className="wm">crushai.fun</div>
          )}
        </div>
      </main>

      <style jsx>{`
        :root{
          --pink:#ff51b3; --violet:#b57eff; --cyan:#b5fffc;
        }
        html,body,#__next{height:100%}
        body{margin:0;background:#0b0512;color:#fff}
        .card-wrap{
          min-height:100%;
          display:flex; align-items:center; justify-content:center;
          padding:20px;
        }
        .card{
          position:relative; width:min(100%, 1500px); aspect-ratio:3/1;
          border-radius:16px; overflow:hidden; background:#0b0512;
          box-shadow:0 20px 60px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.06);
        }
        .bg{position:absolute; inset:0; width:100%; height:100%; object-fit:cover;}
        .shade{position:absolute; inset:0; background:linear-gradient(90deg, rgba(0,0,0,.48), rgba(0,0,0,.18));}
        .glow{position:absolute; inset:0;
          background:radial-gradient(circle at 60% 50%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 62%);
        }

        .content{
          position:relative; height:100%; width:100%;
          display:flex; flex-direction:column; justify-content:center; gap:18px;
          padding:40px 60px 40px 520px;
          text-shadow:0 1px 0 #000, 0 8px 26px rgba(0,0,0,.45);
        }
        .content.center{ padding:60px; align-items:center; text-align:center; }
        .content.compact :global(.title){ font-size:76px; }
        .content.compact :global(.who){ font-size:62px; }
        .content.compact :global(.chip){ padding:10px 16px; font-size:30px; border-width:3px; }

        .title{ font-size:86px; font-weight:1000;
          text-shadow:0 1px 0 #000, 0 12px 34px rgba(250,26,129,.28), 0 6px 24px rgba(181,126,255,.26); }
        .bar{ height:6px; width:260px; border-radius:999px; margin-top:6px;
          background:linear-gradient(90deg, var(--pink), var(--violet), var(--cyan));
          box-shadow:0 6px 20px rgba(181,126,255,.35); opacity:.55; }
        .who{ font-size:70px; font-weight:1000; line-height:1.06; max-width:90%; }
        .chips{ display:flex; flex-wrap:wrap; gap:22px; margin-top:2px; }
        .chip{
          display:flex; align-items:baseline; gap:12px; padding:12px 20px; border-radius:999px;
          border:3.5px solid rgba(255,255,255,.30);
          background:linear-gradient(180deg, rgba(255,255,255,.16), rgba(15,15,18,.33));
          box-shadow:0 14px 34px rgba(0,0,0,.42), inset 0 1px 6px rgba(255,255,255,.20), inset 0 -14px 24px rgba(0,0,0,.30);
          font-size:34px; font-weight:900;
        }
        .chip .k{ opacity:.78; font-weight:800; }
        .chip .v{ font-weight:1000; }
        .tagline{ font-size:34px; font-weight:900; margin-top:6px; }

        .wm{
          position:absolute; right:28px; bottom:22px;
          padding:8px 14px; border-radius:999px;
          border:1.6px solid rgba(255,85,170,.55);
          background:linear-gradient(180deg, rgba(255,120,195,.18), rgba(0,0,0,.24));
          box-shadow:0 8px 18px rgba(0,0,0,.32), 0 0 18px rgba(255,85,170,.35), inset 0 1px 6px rgba(255,255,255,.18);
          color:var(--pink); font-weight:1000; letter-spacing:.4px; font-size:20px;
          text-shadow:0 1px 0 #000, 0 0 10px rgba(255,81,179,.55), 0 0 18px rgba(255,81,179,.35);
        }

        /* small screens */
        @media (max-width:900px) {
          .content{ padding:24px; }
          .title{ font-size:46px; }
          .who{ font-size:40px; }
          .chip{ font-size:22px; padding:8px 14px; border-width:2px; }
          .bar{ height:4px; width:180px; }
        }
      `}</style>
    </>
  );
}
