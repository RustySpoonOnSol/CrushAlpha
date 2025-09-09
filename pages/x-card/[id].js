// pages/x-card/[id].js
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

/* ---------- helpers ---------- */
function sanitizeBg(s) {
  if (!s) return "";
  try {
    const dec = decodeURIComponent(s);
    if (/^https?:\/\//i.test(dec) || dec.startsWith("/")) return dec;
  } catch {}
  return "";
}

export default function XBannerCard() {
  const router = useRouter();
  const { id = "anon" } = router.query;

  // params
  const name = (router.query.name || id || "Anonymous").toString();
  const xp = Number(router.query.xp || 0);
  const rank = router.query.rank ? `#${router.query.rank}` : "#?";
  const pct = (router.query.pct || "Top 100%").toString();
  const bgParam = sanitizeBg((router.query.bg || "").toString());

  // banner fallbacks (relative paths preferred for CORS-safe canvas export)
  const bgCandidates = useMemo(() => {
    const arr = [];
    if (bgParam) arr.push(bgParam);
    arr.push("/brand/x-banner.png", "/images/x-banner.png");
    return arr;
  }, [bgParam]);

  const [bgIdx, setBgIdx] = useState(0);
  const [bgReady, setBgReady] = useState(false);
  const [bgFailed, setBgFailed] = useState(false);
  const curBg = bgCandidates[bgIdx] || "";

  useEffect(() => {
    setBgIdx(0);
    setBgReady(false);
    setBgFailed(false);
  }, [bgCandidates.join("|")]);

  const onBgError = () => {
    if (bgIdx < bgCandidates.length - 1) setBgIdx((i) => i + 1);
    else {
      setBgFailed(true);
      setBgReady(true);
    }
  };

  const pageUrl =
    typeof window !== "undefined" ? window.location.href : "";

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); alert("Copied!"); }
    catch { prompt("Copy this:", text); }
  };

  const shareToX = () => {
    const text = `Crush AI — ${name} · Rank ${rank} (${xp.toLocaleString()} XP)`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}&hashtags=CrushAI,Solana`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  /* ---------- Canvas export (no deps) ---------- */
  async function downloadPng() {
    const W = 1500, H = 500;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    const loadImage = (src) =>
      new Promise((resolve, reject) => {
        if (!src) return reject(new Error("no src"));
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    // background
    let drewImg = false;
    try {
      if (curBg) {
        const img = await loadImage(curBg);
        const r = Math.max(W / img.width, H / img.height);
        const iw = img.width * r, ih = img.height * r;
        const ix = (W - iw) / 2, iy = (H - ih) / 2;
        ctx.drawImage(img, ix, iy, iw, ih);
        drewImg = true;
      }
    } catch {}

    if (!drewImg) {
      const grad = ctx.createRadialGradient(450, 0, 50, 450, 0, 1200);
      grad.addColorStop(0, "#1b0b1d");
      grad.addColorStop(0.55, "#0c0b10");
      grad.addColorStop(1, "#0a0a0f");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // ambient vignette for premium contrast
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, "rgba(6,6,10,0.20)");
    v.addColorStop(1, "rgba(6,6,10,0.45)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(255, 0, 160, 0.45)";
    ctx.shadowBlur = 28;
    ctx.font = "900 120px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("Crush AI", 72, 46);

    // underline (gradient)
    const ugrad = ctx.createLinearGradient(72, 0, 420, 0);
    ugrad.addColorStop(0, "#ff70d9");
    ugrad.addColorStop(1, "#6fd3ff");
    ctx.fillStyle = ugrad;
    ctx.shadowBlur = 0;
    ctx.fillRect(72, 180, 360, 7);

    // Name
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 86px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(name, 72, 208);

    // Stat pills
    const round = (x, y, w, h, r = 28) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    const pill = (label, x, y) => {
      ctx.font = "900 40px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      const padX = 22;
      const w = ctx.measureText(label).width + padX * 2;
      const h = 70;
      // glass gradient
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, "rgba(255,255,255,0.06)");
      g.addColorStop(1, "rgba(255,255,255,0.03)");
      ctx.fillStyle = "rgba(5,5,12,0.55)";
      round(x, y, w, h, 32);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = g;
      round(x, y, w, h, 32);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + padX, y + 14);
      return x + w + 16;
    };
    let X = 72, Y = 300;
    X = pill(`XP: ${xp.toLocaleString()}`, X, Y);
    X = pill(`Rank: ${rank}`, X, Y);
    pill(`Percentile: ${pct}`, X, Y);

    // Tagline
    ctx.font = "900 44px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "#fff";
    ctx.fillText("Chat. Flirt. Climb.", 72, 392);

    // watermark
    const wmText = "crushai.fun";
    ctx.font = "900 28px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    const wmW = ctx.measureText(wmText).width;
    const pad = 16;
    const bx = W - wmW - pad * 2 - 40;
    const by = H - 54;
    round(bx, by, wmW + pad * 2, 40, 22);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.stroke();
    ctx.fillStyle = "#ffb6e6";
    ctx.fillText(wmText, bx + pad, by + 8);

    // download
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "crush-card.png";
    a.click();
  }

  return (
    <>
      <Head>
        <title>Crush AI — Card</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div className="page">
        <div className="stage">
          {/* ambient glows */}
          <div className="glow glow-pink" />
          <div className="glow glow-cyan" />

          {/* background */}
          {!bgFailed && curBg ? (
            <img
              src={curBg}
              alt=""
              className="bg"
              onLoad={() => setBgReady(true)}
              onError={onBgError}
              crossOrigin="anonymous"
            />
          ) : (
            <div className="bg-fallback" />
          )}

          {/* overlay content */}
          <div className="content">
            <h1 className="title">Crush AI</h1>
            <div className="underline" />
            <h2 className="name">{name}</h2>

            <div className="stats">
              <div className="pill">XP: {xp.toLocaleString()}</div>
              <div className="pill">Rank: {rank}</div>
              <div className="pill">Percentile: {pct}</div>
            </div>

            <div className="tagline">Chat. Flirt. Climb.</div>

            <div className="wm">
              crushai.fun
              {!bgReady && <span className="loading"> Loading…</span>}
            </div>
          </div>

          {/* card chrome */}
          <div className="edge" />
        </div>

        {/* share dock */}
        <div className="dock">
          <button onClick={shareToX}>Share on X</button>
          <button onClick={() => copy(pageUrl)}>Copy page link</button>
          <button onClick={() => copy(curBg || "/brand/x-banner.png")}>
            Copy image URL
          </button>
          <button onClick={downloadPng}>Download PNG</button>
          <button
            onClick={async () => {
              if (navigator.share) await navigator.share({ title: "Crush AI", url: pageUrl });
              else copy(pageUrl);
            }}
          >
            Share…
          </button>
        </div>
      </div>

      <style jsx>{`
        :global(html, body) { background:#09080d; }
        .page {
          min-height: 100vh;
          display: grid;
          grid-template-rows: 1fr auto;
          color: #fff;
          background:
            radial-gradient(800px 500px at 20% -10%, rgba(255, 0, 160, 0.12), transparent 60%),
            radial-gradient(900px 560px at 90% -20%, rgba(0, 160, 255, 0.12), transparent 60%),
            #09080d;
        }
        .stage {
          position: relative;
          width: min(1200px, 95vw);
          aspect-ratio: 3 / 1;
          margin: 28px auto 10px;
          border-radius: 22px;
          overflow: hidden;
          background: #0b0910;
          box-shadow:
            0 10px 35px rgba(0,0,0,0.45),
            0 0 0 1px rgba(255,255,255,0.06) inset;
        }
        .edge {
          position: absolute; inset: 0;
          pointer-events: none;
          border-radius: 22px;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.08) inset,
            0 0 40px rgba(255,0,160,0.12) inset,
            0 0 40px rgba(0,160,255,0.10) inset;
        }
        .glow {
          position: absolute; filter: blur(60px); opacity: 0.5; pointer-events: none;
        }
        .glow-pink { width: 340px; height: 340px; left: -60px; top: -60px; background: #ff3bbd; }
        .glow-cyan { width: 360px; height: 360px; right: -80px; bottom: -80px; background: #22ccff; }

        .bg, .bg-fallback {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          object-fit: cover;
        }
        .bg-fallback {
          background: radial-gradient(1200px 700px at 30% 0%, #1b0b1d 0%, #0c0b10 55%, #0a0a0f 100%);
        }

        .content {
          position: absolute; inset: 0;
          display: grid;
          grid-template-rows: auto auto auto 1fr;
          align-content: center;
          padding: clamp(20px, 4vw, 56px);
          gap: clamp(12px, 2.2vw, 22px);
          background: linear-gradient(to bottom, rgba(8,6,10,0.15), rgba(8,6,10,0.40));
        }

        .title {
          font-size: clamp(42px, 9.2vw, 110px);
          line-height: 0.95;
          margin: 0;
          font-weight: 1000;
          text-shadow:
            0 0 24px rgba(255,0,160,0.35),
            0 0 12px rgba(255,255,255,0.15);
        }
        .underline {
          width: clamp(160px, 30vw, 360px);
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(90deg, #ff70d9, #6fd3ff);
        }
        .name {
          font-size: clamp(28px, 6.2vw, 72px);
          margin: 0;
          font-weight: 1000;
          letter-spacing: 0.3px;
          text-shadow: 0 0 10px rgba(0,0,0,0.25);
        }

        .stats {
          display: flex; gap: clamp(10px, 1.6vw, 18px); flex-wrap: wrap;
          margin-top: clamp(6px, 1.2vw, 8px);
        }
        .pill {
          --padX: clamp(14px, 1.8vw, 22px);
          padding: 12px var(--padX);
          border-radius: 999px;
          font-weight: 1000;
          font-size: clamp(14px, 2.2vw, 24px);
          color: #fff;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
          border: 1px solid rgba(255,255,255,0.18);
          box-shadow:
            inset 0 14px 30px rgba(255,255,255,0.06),
            0 4px 16px rgba(0,0,0,0.35);
          backdrop-filter: blur(6px);
        }

        .tagline {
          align-self: end;
          font-size: clamp(18px, 3.3vw, 42px);
          font-weight: 1000;
          text-shadow: 0 0 10px rgba(0,0,0,0.25);
        }

        .wm {
          position: absolute; right: clamp(14px, 2vw, 24px); bottom: clamp(14px, 2vw, 24px);
          font-weight: 1000; color: #ffb6e6;
          background: rgba(0,0,0,0.35);
          border: 1px solid rgba(255,255,255,0.22);
          padding: 10px 16px; border-radius: 999px;
          backdrop-filter: blur(6px);
        }
        .loading { margin-left: 8px; opacity: 0.85; }

        .dock {
          display: flex; gap: 14px; flex-wrap: wrap; justify-content: center;
          padding: 18px 16px 26px;
          background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.04));
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .dock button {
          color: #fff; font-weight: 900; cursor: pointer;
          padding: 12px 16px; border-radius: 999px;
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.22);
          box-shadow: 0 6px 18px rgba(0,0,0,0.35);
        }
        .dock button:hover { background: rgba(255,255,255,0.18); }
      `}</style>
    </>
  );
}
