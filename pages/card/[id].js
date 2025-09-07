// src/pages/card/[id].js
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (typeof window !== "undefined" ? window.location.origin : "https://example.com");

function buildQueryFrom(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === "") continue;
    p.set(k, String(v));
  }
  return p.toString();
}

export default function CardSharePage() {
  const router = useRouter();
  const { id } = router.query;

  // read query params (pass-through to the image)
  const q = router.query || {};
  const name = (q.name || id || "anon").toString();
  const xp = q.xp || "0";
  const rank = q.rank || "?";
  const pct = q.pct || "Top 100%";
  const title = q.title || "Crush AI";
  const tagline = q.tagline || "Chat. Flirt. Climb.";
  const s = q.s;
  const center = q.center;
  const compact = q.compact;
  const wm = q.wm;
  const bg = q.bg || `${SITE}/brand/x-banner.jpg`;

  const imgParams = buildQueryFrom({ name, xp, rank, pct, title, tagline, s, center, compact, wm, bg });
  const imgSrc = `/api/x-banner/${encodeURIComponent(id || "anon")}?${imgParams}`;
  const pageUrl = useMemo(() => (typeof window !== "undefined" ? window.location.href : `${SITE}/card/${id}?${imgParams}`), [id, imgParams]);

  const [copied, setCopied] = useState("");

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label || "Copied!");
      setTimeout(() => setCopied(""), 1200);
    } catch {
      setCopied("Press Ctrl/Cmd+C to copy");
      setTimeout(() => setCopied(""), 1600);
    }
  }

  const shareX = () => {
    const text = `$CRUSH ${name} — Rank #${rank} (${Number(xp || 0).toLocaleString()} XP)`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}&hashtags=CrushAI,Solana`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${title} — ${name}`, url: pageUrl, text: `${name} · ${tagline}` });
      } catch {}
    } else {
      copy(pageUrl, "Link copied");
    }
  };

  const downloadPng = async () => {
    try {
      const res = await fetch(imgSrc, { cache: "no-store" });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}-crush-card.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      copy(imgSrc, "Image URL copied");
    }
  };

  return (
    <>
      <Head>
        <title>{`${title} — ${name}`}</title>
        <meta name="description" content={`${name} · ${tagline}`} />
        {/* Make this page share beautifully anywhere */}
        <meta property="og:title" content={`${title} — ${name}`} />
        <meta property="og:description" content={`${name} · ${tagline}`} />
        <meta property="og:image" content={`${SITE}${imgSrc}`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${title} — ${name}`} />
        <meta name="twitter:description" content={`${name} · ${tagline}`} />
        <meta name="twitter:image" content={`${SITE}${imgSrc}`} />
        <link rel="preload" as="image" href={imgSrc} imagesrcset={`${imgSrc} 1500w`} />
      </Head>

      <main className="wrap">
        <div className="card">
          <img src={imgSrc} alt={`${name} share card`} className="preview" />
          <div className="actions" role="group" aria-label="Share actions">
            <button className="btn btn-x" onClick={shareX} title="Share on X">Share on X</button>
            <button className="btn" onClick={() => copy(pageUrl, "Link copied")} title="Copy page link">Copy page link</button>
            <button className="btn" onClick={() => copy(imgSrc, "Image URL copied")} title="Copy image URL">Copy image URL</button>
            <button className="btn btn-primary" onClick={downloadPng} title="Download PNG">Download PNG</button>
            <button className="btn" onClick={shareNative} title="Share via device">Share…</button>
          </div>
          {copied ? <div className="toast">{copied}</div> : null}
        </div>
        <p className="hint">Tip: this page’s preview is the same image platforms will use when you post the link.</p>
      </main>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: linear-gradient(135deg, #ffb6d5 0%, #b57eff 40%, #8bb7ff 100%);
        }
        .card {
          width: 100%;
          max-width: 980px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          background: rgba(15, 5, 25, 0.55);
          border: 1px solid rgba(255,255,255,.16);
          border-radius: 18px;
          padding: 16px;
          backdrop-filter: blur(10px) saturate(1.2);
          box-shadow: 0 30px 60px rgba(0,0,0,.35);
        }
        .preview {
          width: 100%;
          height: auto;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.2);
          box-shadow: 0 10px 28px rgba(0,0,0,.35);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: center;
        }
        .btn {
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.24);
          background: rgba(255,255,255,.12);
          color: #fff;
          font-weight: 900;
          cursor: pointer;
          transition: transform .12s ease, box-shadow .2s ease, background .2s ease;
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 12px 22px rgba(0,0,0,.28); }
        .btn:active { transform: translateY(0); }
        .btn-primary {
          background: linear-gradient(90deg,#fa1a81,#b57eff);
          border-color: rgba(255,255,255,.28);
          box-shadow: 0 0 18px rgba(250,26,129,.45), 0 10px 22px rgba(181,126,255,.28);
        }
        .btn-x {
          background: radial-gradient(140% 140% at 50% -20%, #000 0%, #171717 55%, #2a2a2a 100%);
          border-color: rgba(255,255,255,.22);
        }
        .toast {
          margin-top: 6px;
          background: rgba(0,0,0,.7);
          color:#fff;
          padding:8px 12px;
          border:1px solid rgba(255,255,255,.18);
          border-radius: 10px;
          font-weight: 900;
        }
        .hint {
          margin-top: 10px;
          color: #fff;
          opacity: .9;
          font-weight: 800;
          text-shadow: 0 1px 0 #000;
        }
      `}</style>
    </>
  );
}
