// pages/api/x-banner/[id].js — OG card on Edge (Next 13.4.x, Pages Router)
import { ImageResponse } from "next/og";
export const config = { runtime: "edge" }; // <- changed from experimental-edge



/* ---------------- helpers (edge-safe) ---------------- */
async function loadFontFrom(candidates) {
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) continue;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("text/html")) continue; // 404 page etc.
      const ab = await res.arrayBuffer();
      const head = new TextDecoder().decode(new Uint8Array(ab).slice(0, 8));
      if (head.startsWith("<!DO") || head.startsWith("<html")) continue;
      return ab;
    } catch {}
  }
  return null; // still render fine without
}

async function toDataURL(url) {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return null;
    const ab = await res.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(ab);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

async function firstImageDataURL(urls) {
  for (const u of urls) {
    if (!u) continue;
    const d = await toDataURL(u);
    if (d) return d;
  }
  return null;
}

/* ---------------- route ---------------- */
export default async function handler(req) {
  try {
    const u = new URL(req.url);
    const id = decodeURIComponent(u.pathname.split("/").pop() || "").trim() || "anon";

    // Query params (all optional)
    const title   = u.searchParams.get("title") || "Crush AI";
    const name    = u.searchParams.get("name")  || id;
    const xp      = Number(u.searchParams.get("xp") || "0");
    const rank    = u.searchParams.get("rank") || "?";
    const pct     = u.searchParams.get("pct")  || "Top 100%";
    const tagline = u.searchParams.get("tagline") || "Chat. Flirt. Climb.";
    const hideWm  = u.searchParams.get("wm") === "0";
    const manualScale = Math.max(0.6, Math.min(1.2, Number(u.searchParams.get("s") || "1")));
    const compact = u.searchParams.get("compact") === "1";    // slightly smaller type + chips
    const center  = u.searchParams.get("center") === "1";     // center-align content

    const origin = u.origin;

    // Robust PNG banner (explicit ?bg= wins; else try same-origin fallbacks)
    const bgData = await firstImageDataURL([
      u.searchParams.get("bg"),
      `${origin}/brand/x-banner.png`,
      `${origin}/images/x-banner.png`,
      `${origin}/x-banner.png`,
    ]);

    // Optional fonts (safe to fail)
    const [inter800, inter700] = await Promise.all([
      loadFontFrom([
        `${origin}/fonts/Inter-ExtraBold.woff`,
        `${origin}/fonts/Inter-Bold.woff`,
        "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.5/files/inter-latin-800-normal.woff",
      ]),
      loadFontFrom([
        `${origin}/fonts/Inter-SemiBold.woff`,
        "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.5/files/inter-latin-700-normal.woff",
      ]),
    ]);

    // Canvas
    const W = 1500, H = 500;

    // Auto scale for long names
    const len = (name || "").length;
    let autoScale = 1.0;
    if (len > 22) autoScale = 0.9;
    if (len > 28) autoScale = 0.82;
    if (len > 34) autoScale = 0.74;
    if (len > 42) autoScale = 0.68;
    const SCALE = Math.max(0.62, Math.min(1.1, autoScale * manualScale));

    // Sizes (compact trims ~12–15%)
    const TITLE_SIZE = Math.round((compact ? 76 : 86) * SCALE);
    const NAME_SIZE  = Math.round((compact ? 62 : 70) * SCALE);
    const CHIP_FS    = Math.max(24, Math.round((compact ? 30 : 34) * SCALE));
    const CHIP_PAD_V = Math.max(9,  Math.round((compact ? 10 : 12) * SCALE));
    const CHIP_PAD_H = Math.max(14, Math.round((compact ? 16 : 20) * SCALE));
    const CHIP_BORDER = Math.max(2, Math.round((compact ? 3 : 3.5) * SCALE));

    // Spacing / Safe area
    const SAFE_X = 60;
    const PAD_LEFT = center ? 420 : 520;
    const CONTENT_GAP = Math.round((compact ? 14 : 18) * SCALE);
    const CHIPS_GAP   = Math.round((compact ? 18 : 22) * SCALE);

    const chip = {
      display: "flex",
      alignItems: "baseline",
      gap: Math.max(10, Math.round((compact ? 10 : 12) * SCALE)),
      padding: `${CHIP_PAD_V}px ${CHIP_PAD_H}px`,
      borderRadius: 999,
      border: `${CHIP_BORDER}px solid rgba(255,255,255,0.30)`,
      background: "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(15,15,18,0.33))",
      boxShadow:
        "0 14px 34px rgba(0,0,0,0.42), inset 0 1px 6px rgba(255,255,255,0.20), inset 0 -14px 24px rgba(0,0,0,0.30)",
      color: "#fff",
      fontWeight: 800,
      fontSize: CHIP_FS,
      textShadow: "0 2px 10px rgba(0,0,0,0.5)",
      whiteSpace: "nowrap",
    };

    return new ImageResponse(
      (
        <div style={{
          width: "100%", height: "100%", display: "flex", position: "relative",
          backgroundColor: "#0b0512"
        }}>
          {/* Background image */}
          {bgData ? (
            <img
              src={bgData} width={W} height={H}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : null}

          {/* Darken + soft radial (OG-safe gradients) */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.30) 40%, rgba(0,0,0,0.18) 100%)"
          }} />
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(circle at 60% 50%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 62%)"
          }} />

          {/* Content */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: center ? "center" : "flex-start",
              padding: center ? `${SAFE_X}px ${SAFE_X}px` : `40px ${SAFE_X}px 40px ${PAD_LEFT}px`,
              width: "100%",
              height: "100%",
              color: "#fff",
              gap: CONTENT_GAP,
            }}
          >
            {/* Title */}
            <div style={{
              fontSize: TITLE_SIZE,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: 0.2,
              textShadow: "0 1px 0 #000, 0 12px 34px rgba(250,26,129,0.28), 0 6px 24px rgba(181,126,255,0.26)",
              whiteSpace: "nowrap",
            }}>
              {title}
            </div>

            {/* Accent bar under title */}
            <div style={{
              height: Math.max(5, Math.round(6 * SCALE)),
              width: Math.round(260 * SCALE),
              borderRadius: 999,
              marginTop: Math.round(6 * SCALE),
              background: "linear-gradient(90deg, #ff51b3, #b57eff, #b5fffc)",
              opacity: 0.55,
              boxShadow: "0 6px 20px rgba(181,126,255,0.35)",
            }} />

            {/* Name */}
            <div style={{
              fontSize: NAME_SIZE,
              fontWeight: 800,
              lineHeight: 1.06,
              textShadow: "0 1px 0 #000, 0 10px 30px rgba(0,0,0,0.45)",
              maxWidth: 900,
            }}>
              {name}
            </div>

            {/* Chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: CHIPS_GAP, maxWidth: 1100 }}>
              <div style={chip}>
                <span style={{ opacity: 0.78 }}>XP:</span>
                <span style={{ fontWeight: 900 }}>{xp.toLocaleString()}</span>
              </div>
              <div style={chip}>
                <span style={{ opacity: 0.78 }}>Rank:</span>
                <span style={{ fontWeight: 900 }}>#{rank}</span>
              </div>
              <div style={chip}>
                <span style={{ opacity: 0.78 }}>Percentile:</span>
                <span style={{ fontWeight: 900 }}>{pct}</span>
              </div>
            </div>

            {/* Tagline */}
            <div style={{
              marginTop: Math.round(6 * SCALE),
              fontSize: Math.round(34 * SCALE),
              fontWeight: 900,
              opacity: 0.98,
              textShadow: "0 1px 0 #000, 0 8px 26px rgba(0,0,0,0.45)",
            }}>
              {tagline}
            </div>
          </div>

          {/* Watermark — pink */}
          {!hideWm && (
            <div style={{ position: "absolute", right: 28, bottom: 22, display: "flex", alignItems: "center" }}>
              <div style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "1.6px solid rgba(255, 85, 170, 0.55)",
                background: "linear-gradient(180deg, rgba(255, 120, 195, 0.18), rgba(0,0,0,0.24))",
                boxShadow:
                  "0 8px 18px rgba(0,0,0,0.32), 0 0 18px rgba(255, 85, 170, 0.35), inset 0 1px 6px rgba(255,255,255,0.18)",
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: 0.4,
                color: "#ff51b3",
                textShadow: "0 1px 0 #000, 0 0 10px rgba(255, 81, 179, 0.55), 0 0 18px rgba(255, 81, 179, 0.35)",
                opacity: 0.98,
              }}>
                crushai.fun
              </div>
            </div>
          )}
        </div>
      ),
      {
        width: W,
        height: H,
        fonts: [
          inter800 && { name: "Inter", data: inter800, weight: 800, style: "normal" },
          inter700 && { name: "Inter", data: inter700, weight: 700, style: "normal" },
        ].filter(Boolean),
      }
    );
  } catch (e) {
    return new Response(`OG error: ${e.message}`, { status: 500 });
  }
}
