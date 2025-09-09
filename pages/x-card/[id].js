// pages/x-card/[id].js
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

export default function XCardPage() {
  const { query, asPath } = useRouter();

  const id      = (query.id || "").toString();
  const title   = (query.title   || "Crush AI").toString();
  const name    = (query.name    || id || "Anonymous").toString();
  const xp      = Number(query.xp || 0);
  const rank    = (query.rank    || "?").toString();
  const pct     = (query.pct     || "Top 100%").toString();
  const tagline = (query.tagline || "Chat. Flirt. Climb.").toString();
  const hideWm  = query.wm === "0";
  const bg      = (query.bg || "/brand/x-banner.png").toString();

  const cardRef = useRef(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    // Absolute URL for sharing
    const base = window.location.origin.replace(/\/$/, "");
    // Keep current query params
    return base + asPath;
  }, [asPath]);

  /* try to preload html2canvas (from CDN) for PNG capture */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.html2canvas) return;
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    document.head.appendChild(s);
    return () => { document.head.removeChild(s); };
  }, []);

  async function captureToBlob() {
    const el = cardRef.current;
    if (!el) throw new Error("Card not mounted");
    // Prefer html2canvas for accurate styled-jsx capture
    if (typeof window !== "undefined" && window.html2canvas) {
      const canvas = await window.html2canvas(el, {
        backgroundColor: null,
        scale: 2,              // retina
        useCORS: true,         // allow same-origin images
        logging: false,
      });
      return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    }

    // Fallback: SVG foreignObject (limited styling support)
    const xml = new XMLSerializer().serializeToString(el);
    const w = el.offsetWidth || 1500;
    const h = el.offsetHeight || 500;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <foreignObject width="100%" height="100%">${xml}</foreignObject>
      </svg>`;
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = w * 2; canvas.height = h * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2,2);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  async function downloadPNG() {
    try {
      const blob = await captureToBlob();
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `crush_card_${id || "share"}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { console.error(e); alert("Could not create PNG right now."); }
  }

  async function copyImageUrl() {
    try {
      const blob = await captureToBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      await navigator.clipboard.writeText(url);
      alert("Temporary image URL copied (valid while this tab is open).");
    } catch (e) { console.error(e); alert("Could not copy image URL."); }
  }

  async function copyPageLink() {
    try { await navigator.clipboard.writeText(shareUrl); alert("Page link copied."); }
    catch { prompt("Copy this link:", shareUrl); }
  }

  function shareToX() {
    const text = `${title} — ${name}\nXP: ${xp.toLocaleString()}  •  Rank: #${rank}  •  ${pct}`;
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}&hashtags=CrushAI,Solana`;
    window.open(intent, "_blank", "noopener,noreferrer");
  }

  async function shareNative() {
    try {
      if (navigator.share && navigator.canShare) {
        const blob = await captureToBlob();
        const file = blob ? new File([blob], `crush_card_${id||"share"}.png`, { type: "image/png" }) : null;
        if (file && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: `${title} — ${name}`, text: "Crush AI", url: shareUrl, files: [file] });
          return;
        }
      }
    } catch (_) {}
    // Fallback
    copyPageLink();
  }

  return (
    <>
      <Head>
        <title>{title} — Card</title>
        <meta name="robots" content="noindex" />
        <link rel="preload" as="image" href="/brand/x-banner.png" />
      </Head>

      <main className="wrap">
        <div className="card" ref={cardRef} aria-label="Share card">
          <img src={bg} alt="" className="bg" crossOrigin="anonymous" onLoad={()=>setImgLoaded(true)} />
          <div className="vignette" />
          <div className="content">
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
          {!hideWm && <div className="wm">crushai.fun</div>}
          {!imgLoaded && <div className="loading">Loading…</div>}
        </div>

        {/* Share dock */}
        <div className="dock" role="group" aria-label="Share actions">
          <button className="btn btn-x" onClick={shareToX} title="Share on X">Share on X</button>
          <button className="btn" onClick={copyPageLink} title="Copy page link">Copy page link</button>
          <button className="btn" onClick={copyImageUrl} title="Copy image URL">Copy image URL</button>
          <button className="btn btn-primary" onClick={downloadPNG} title="Download PNG">Download PNG</button>
          <button className="btn" onClick={shareNative} title="Share…">Share…</button>
        </div>
      </main>

      <style jsx>{`
        :root{ --pink:#fa1a81; --violet:#b57eff; --cyan:#b5fffc; }
        html,body,#__next{height:100%} body{margin:0;background:#0b0512;color:#fff}
        .wrap{min-height:100%; display:flex; flex-direction:column; align-items:center; gap:16px; padding:16px;}

        .card{
          position:relative; width:min(1500px,100%); aspect-ratio:3/1;
          border-radius:16px; overflow:hidden; background:#0b0512;
          box-shadow:0 20px 60px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.06);
        }
        .bg{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
        .vignette{
          position:absolute; inset:0;
          background:
            radial-gradient(120% 140% at 30% 50%, rgba(0,0,0,.15) 0%, rgba(0,0,0,0) 45%),
            linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.18) 60%, rgba(0,0,0,.45));
        }
        .content{
          position:relative; height:100%; display:flex; flex-direction:column; justify-content:center; gap:18px;
          padding:40px 56px 40px 460px; text-shadow:0 1px 0 #000, 0 10px 30px rgba(0,0,0,.45);
        }
        .title{ font-size:112px; line-height:1; font-weight:1000; text-shadow:0 1px 0 #000, 0 18px 44px rgba(250,26,129,.35), 0 10px 32px rgba(181,126,255,.28); }
        .bar{ height:6px; width:260px; border-radius:999px; margin-top:8px; background:linear-gradient(90deg,var(--pink),var(--violet),var(--cyan)); box-shadow:0 8px 22px rgba(181,126,255,.35); opacity:.9; }
        .who{ font-size:84px; font-weight:1000; line-height:1.06; }
        .chips{ display:flex; flex-wrap:wrap; gap:20px; margin-top:6px; }
        .chip{
          display:flex; align-items:baseline; gap:12px; padding:14px 22px; border-radius:999px; font-size:36px; font-weight:900;
          color:#fff; border:3px solid rgba(255,255,255,.28);
          background:linear-gradient(180deg, rgba(255,255,255,.16), rgba(15,15,18,.35));
          box-shadow:0 14px 34px rgba(0,0,0,.42), inset 0 1px 6px rgba(255,255,255,.20), inset 0 -14px 24px rgba(0,0,0,.30);
        }
        .k{ opacity:.85; font-weight:800; } .v{ font-weight:1000; }
        .tagline{ font-size:40px; font-weight:1000; margin-top:4px; }
        .wm{
          position:absolute; right:26px; bottom:20px; padding:10px 18px; border-radius:999px;
          color:#ff51b3; font-weight:1000; letter-spacing:.4px; font-size:20px;
          border:1.6px solid rgba(255,85,170,.55);
          background:linear-gradient(180deg, rgba(255,120,195,.18), rgba(0,0,0,.24));
          box-shadow:0 8px 18px rgba(0,0,0,.32), 0 0 18px rgba(255,85,170,.35), inset 0 1px 6px rgba(255,255,255,.18);
        }
        .loading{ position:absolute; inset:auto 12px 12px auto; background:rgba(0,0,0,.5); padding:6px 10px; border-radius:8px; font-weight:900; }

        /* Share dock */
        .dock{
          width:min(1500px,100%);
          display:flex; flex-wrap:wrap; gap:14px;
          justify-content:center; padding:16px;
          border-radius:18px;
          background:rgba(255,255,255,.10);
          border:1px solid rgba(255,255,255,.18);
          backdrop-filter:blur(10px) saturate(1.1);
        }
        .btn{
          display:inline-flex; align-items:center; justify-content:center;
          min-height:42px; padding:12px 16px; border-radius:999px;
          color:#fff; font-weight:1000; letter-spacing:.2px;
          border:1px solid rgba(255,255,255,.24); background:rgba(255,255,255,.12);
          cursor:pointer; user-select:none; transition:transform .12s, box-shadow .2s, background .2s;
        }
        .btn:hover{ transform:translateY(-2px); box-shadow:0 14px 28px rgba(0,0,0,.28); }
        .btn-primary{ background:linear-gradient(90deg,#fa1a81,#b57eff); border-color:rgba(255,255,255,.28); box-shadow:0 0 18px rgba(250,26,129,.45), 0 10px 22px rgba(181,126,255,.28); }
        .btn-x{ background:radial-gradient(140% 140% at 50% -20%, #000 0%, #171717 55%, #2a2a2a 100%); border-color:rgba(255,255,255,.22); }
        @media (max-width:900px){
          .content{ padding:30px; }
          .title{ font-size:64px; } .who{ font-size:48px; }
          .chip{ font-size:22px; padding:10px 14px; border-width:2px; }
          .tagline{ font-size:24px; }
          .btn{ width:100%; }
        }
      `}</style>
    </>
  );
}
