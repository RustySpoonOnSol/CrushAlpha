// pages/x-card/[id].js
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

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

  const name = (router.query.name || id || "Anonymous").toString();
  const xp = Number(router.query.xp || 0);
  const rank = router.query.rank ? `#${router.query.rank}` : "#?";
  const pct = (router.query.pct || "Top 100%").toString();
  const bgParam = sanitizeBg((router.query.bg || "").toString());

  // ---- banner fallback chain (relative first)
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
    if (bgIdx < bgCandidates.length - 1) {
      setBgIdx((i) => i + 1);
    } else {
      setBgFailed(true);
      setBgReady(true); // stop showing "Loading…"
    }
  };

  const pageUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, [router.asPath]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied!");
    } catch {
      prompt("Copy this:", text);
    }
  };

  const shareToX = () => {
    const text = `Crush AI — ${name} · Rank ${rank} (${xp.toLocaleString()} XP)`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      text
    )}&url=${encodeURIComponent(pageUrl)}&hashtags=CrushAI,Solana`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ---- Download PNG: draw a 1500x500 banner with Canvas (no deps)
  async function downloadPng() {
    const W = 1500, H = 500;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    // helpers
    const loadImage = (src) =>
      new Promise((resolve, reject) => {
        if (!src) return reject(new Error("no src"));
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    const roundRect = (x, y, w, h, r = 28) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    // background
    let drewImg = false;
    try {
      if (curBg) {
        const img = await loadImage(curBg);
        // cover
        const ratio = Math.max(W / img.width, H / img.height);
        const iw = img.width * ratio, ih = img.height * ratio;
        const ix = (W - iw) / 2, iy = (H - ih) / 2;
        ctx.drawImage(img, ix, iy, iw, ih);
        drewImg = true;
      }
    } catch (_) {}

    if (!drewImg) {
      const grad = ctx.createRadialGradient(450, 0, 50, 450, 0, 1200);
      grad.addColorStop(0, "#1b0b1d");
      grad.addColorStop(0.55, "#0c0b10");
      grad.addColorStop(1, "#0a0a0f");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // subtle dark overlay for readability
    const overlay = ctx.createLinearGradient(0, 0, 0, H);
    overlay.addColorStop(0, "rgba(8,6,10,0.25)");
    overlay.addColorStop(1, "rgba(8,6,10,0.55)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(255,0,128,0.35)";
    ctx.shadowBlur = 24;

    ctx.font = "900 130px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("Crush AI", 80, 50);

    // Name
    ctx.shadowBlur = 0;
    ctx.font = "900 86px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(name, 80, 200);

    // Stat pills
    const pill = (label, x, y) => {
      const padX = 26, padY = 14;
      ctx.font = "900 44px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      const w = ctx.measureText(label).width + padX * 2;
      const h = 72;
      ctx.fillStyle = "rgba(0,0,0,0.42)";
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 2;
      roundRect(x, y, w, h, 32);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + padX, y + 12);
      return x + w + 18;
    };
    let x = 80, y = 310;
    x = pill(`XP: ${xp.toLocaleString()}`, x, y);
    x = pill(`Rank: ${rank}`, x, y);
    pill(`Percentile: ${pct}`, x, y);

    // Tagline
    ctx.font = "900 46px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "#fff";
    ctx.fillText("Chat. Flirt. Climb.", 80, 410);

    // watermark
    ctx.font = "900 28px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "#ffb6e6";
    const wm = "crushai.fun";
    const wmW = ctx.measureText(wm).width;
    const pad = 18;
    // bubble
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    roundRect(W - wmW - pad * 2 - 24, H - 54, wmW + pad * 2, 40, 20);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffb6e6";
    ctx.fillText(wm, W - wmW - pad - 20, H - 48);

    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "crush-card.png";
    a.click();
  }

  const wrapRef = useRef(null);

  return (
    <>
      <Head>
        <title>Crush AI — Card</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div className="page">
        <div className="stage" ref={wrapRef}>
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

          <div className="content">
            <div className="title">Crush AI</div>
            <div className="name">{name}</div>
            <div className="stats">
              <div className="pill">XP: {xp.toLocaleString()}</div>
              <div className="pill">Rank: {rank}</div>
              <div className="pill">Percentile: {pct}</div>
            </div>
            <div className="tagline">Chat. Flirt. Climb.</div>

            <div className="wm">
              crushai.fun{!bgReady && <span className="loading"> Loading…</span>}
            </div>
          </div>
        </div>

        <div className="dock">
          <button onClick={shareToX}>Share on X</button>
          <button onClick={() => copy(pageUrl)}>Copy page link</button>
          <button onClick={() => copy(curBg || "/brand/x-banner.png")}>
            Copy image URL
          </button>
          <button onClick={downloadPng}>Download PNG</button>
          <button
            onClick={async () => {
              if (navigator.share) {
                await navigator.share({ title: "Crush AI", url: pageUrl });
              } else {
                copy(pageUrl);
              }
            }}
          >
            Share…
          </button>
        </div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          display: grid;
          grid-template-rows: 1fr auto;
          background: radial-gradient(1200px 700px at 30% 0%, #1b0b1d 0%, #0c0b10 55%, #0a0a0f 100%);
          color: #fff;
        }
        .stage {
          position: relative;
          width: 100%;
          max-width: 1200px;
          aspect-ratio: 3 / 1;
          margin: 24px auto 0;
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 10px 38px rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: #0b0910;
        }
        .bg,
        .bg-fallback {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .bg-fallback {
          background: radial-gradient(1200px 700px at 30% 0%, #1b0b1d, #0c0b10 55%, #0a0a0f);
        }
        .content {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-rows: auto auto auto 1fr;
          align-content: center;
          padding: 40px 56px;
          gap: 22px;
          background: linear-gradient(to bottom, rgba(8, 6, 10, 0.15), rgba(8, 6, 10, 0.35));
        }
        .title {
          font-size: clamp(36px, 9vw, 108px);
          font-weight: 1000;
          line-height: 0.95;
          text-shadow: 0 0 24px rgba(255, 0, 128, 0.35);
        }
        .name {
          font-size: clamp(28px, 6vw, 72px);
          font-weight: 1000;
          line-height: 1;
        }
        .stats {
          display: flex;
          gap: 18px;
          flex-wrap: wrap;
        }
        .pill {
          padding: 12px 18px;
          border-radius: 999px;
          font-weight: 1000;
          background: rgba(0, 0, 0, 0.42);
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: inset 0 0 30px rgba(255, 255, 255, 0.05);
        }
        .tagline {
          align-self: end;
          font-size: clamp(18px, 3vw, 40px);
          font-weight: 1000;
        }
        .wm {
          position: absolute;
          right: 24px;
          bottom: 24px;
          font-weight: 1000;
          color: #ffb6e6;
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.22);
          padding: 10px 16px;
          border-radius: 999px;
          backdrop-filter: blur(6px);
        }
        .loading {
          margin-left: 8px;
          opacity: 0.85;
        }
        .dock {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          justify-content: center;
          padding: 18px 16px 26px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.04));
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .dock button {
          color: #fff;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 12px 16px;
          border-radius: 999px;
          font-weight: 900;
          cursor: pointer;
        }
        .dock button:hover {
          background: rgba(255, 255, 255, 0.18);
        }
      `}</style>
    </>
  );
}
