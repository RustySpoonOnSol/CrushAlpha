// src/pages/api/x-banner/[id].js
import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

/** Fonts (fast + stable CDN) */
const interBoldP = fetch(
  "https://og-playground.vercel.app/static/fonts/Inter-Bold.woff"
).then(r => r.arrayBuffer());
const interSemiP = fetch(
  "https://og-playground.vercel.app/static/fonts/Inter-SemiBold.woff"
).then(r => r.arrayBuffer());

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const id = decodeURIComponent(url.pathname.split("/").pop() || "").trim();

    // Values from querystring (UI will pass them)
    const name = url.searchParams.get("name") || id || "Anonymous";
    const xp = Number(url.searchParams.get("xp") || "0");
    const rank = url.searchParams.get("rank") || "?";
    const pct = url.searchParams.get("pct") || "Top 100%";

    // Optional custom bg ?bg=https://... (else use /brand/x-banner.jpg from public/)
    const origin = url.origin;
    const bg = url.searchParams.get("bg") || `${origin}/brand/x-banner.jpg`;

    const [interBold, interSemi] = await Promise.all([interBoldP, interSemiP]);

    const W = 1500;
    const H = 500;

    // Layout notes:
    // - Your artwork has a heart on the left and profile on the right.
    // - We pad left by ~540px to avoid covering the heart.
    // - A soft dark overlay ensures legible white text on bright neon.
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            position: "relative",
            background: "linear-gradient(90deg,#0b0512,#180a2b)",
          }}
        >
          <img
            src={bg}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />

          {/* darken for legibility */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,.20) 40%, rgba(0,0,0,.15) 100%)",
            }}
          />

          {/* highlight glow */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(1000px 480px at 52% 52%, rgba(255,255,255,.12), transparent 65%)",
            }}
          />

          {/* Content */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "48px 64px 48px 540px",
              width: "100%",
              height: "100%",
              color: "#fff",
              textShadow: "0 2px 12px rgba(0,0,0,.45)",
            }}
          >
            <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: 0.2 }}>
              Crush AI — Leaderboard
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 58,
                fontWeight: 800,
                lineHeight: 1.1,
              }}
            >
              {name}
            </div>

            <div
              style={{
                display: "flex",
                gap: 20,
                marginTop: 18,
                fontSize: 30,
                fontWeight: 700,
              }}
            >
              <Pill label="XP" value={xp.toLocaleString()} />
              <Pill label="Rank" value={`#${rank}`} />
              <Pill label="Percentile" value={pct} />
            </div>

            <div
              style={{
                marginTop: 26,
                fontSize: 26,
                fontWeight: 700,
                opacity: 0.95,
              }}
            >
              Chat. Flirt. Climb.
            </div>
          </div>
        </div>
      ),
      {
        width: W,
        height: H,
        fonts: [
          { name: "Inter", data: interBold, weight: 800, style: "normal" },
          { name: "Inter", data: interSemi, weight: 700, style: "normal" },
        ],
      }
    );
  } catch (e) {
    return new Response(`OG error: ${e.message}`, { status: 500 });
  }
}

/** Small stat chip component for @vercel/og JSX */
function Pill({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 999,
        border: "3px solid rgba(255,255,255,.65)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,.18), rgba(0,0,0,.18))",
        boxShadow:
          "0 10px 24px rgba(0,0,0,.25), inset 0 0 22px rgba(255,255,255,.22)",
      }}
    >
      <span style={{ opacity: 0.92 }}>{label}:</span>
      <span style={{ fontWeight: 800 }}>{value}</span>
    </div>
  );
}
