// pages/card/[id].js — OG card on experimental-edge (no @vercel/og, no wasm setup)
import { ImageResponse } from "next/server";
export const config = { runtime: "experimental-edge" };

/* ---- helpers ---- */
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
async function firstDataUrl(urls) {
  for (const u of urls) {
    if (!u) continue;
    const d = await toDataURL(u);
    if (d) return d;
  }
  return null;
}

/* ---- route ---- */
export default async function handler(req) {
  try {
    const u = new URL(req.url);
    const id = decodeURIComponent(u.pathname.split("/").pop() || "");

    const title   = u.searchParams.get("title")   || "Crush AI";
    const name    = u.searchParams.get("name")    || id || "Anonymous";
    const xp      = Number(u.searchParams.get("xp") || "0");
    const rank    = u.searchParams.get("rank")    || "?";
    const pct     = u.searchParams.get("pct")     || "Top 100%";
    const tagline = u.searchParams.get("tagline") || "Chat. Flirt. Climb.";
    const hideWm  = u.searchParams.get("wm") === "0";
    const origin  = u.origin;

    // Same-origin PNG banner (with fallbacks)
    const bg = await firstDataUrl([
      u.searchParams.get("bg"),
      `${origin}/brand/x-banner.png`,
      `${origin}/images/x-banner.png`,
      `${origin}/x-banner.png`,
    ]);

    const W = 1500, H = 500;

    return new ImageResponse(
      (
        <div style={{ width: W, height: H, position: "relative", display: "flex", backgroundColor:"#0b0512" }}>
          {bg && (
            <img
              src={bg}
              width={W}
              height={H}
              style={{ position:"absolute", inset:0, objectFit:"cover" }}
            />
          )}

          <div style={{ position:"absolute", inset:0,
                        background:"linear-gradient(90deg, rgba(0,0,0,.48), rgba(0,0,0,.18))" }} />

          <div style={{
            display:"flex", flexDirection:"column", justifyContent:"center",
            padding:"40px 60px 40px 520px", width:"100%", color:"#fff", gap:18
          }}>
            <div style={{ fontSize:86, fontWeight:800, textShadow:"0 1px 0 #000, 0 12px 34px rgba(250,26,129,.28)" }}>
              {title}
            </div>
            <div style={{
              height:6, width:260, borderRadius:999,
              background:"linear-gradient(90deg,#ff51b3,#b57eff,#b5fffc)",
              opacity:.55, boxShadow:"0 6px 20px rgba(181,126,255,.35)"
            }} />
            <div style={{ fontSize:70, fontWeight:800, textShadow:"0 1px 0 #000, 0 10px 30px rgba(0,0,0,.45)" }}>
              {name}
            </div>
            <div style={{ display:"flex", gap:22 }}>
              {[
                ["XP:", xp.toLocaleString()],
                ["Rank:", `#${rank}`],
                ["Percentile:", pct],
              ].map(([k,v]) => (
                <div key={k} style={{
                  display:"flex", gap:12, padding:"12px 20px", borderRadius:999,
                  border:"3px solid rgba(255,255,255,.30)",
                  background:"linear-gradient(180deg, rgba(255,255,255,.16), rgba(15,15,18,.33))",
                  boxShadow:"0 14px 34px rgba(0,0,0,.42), inset 0 1px 6px rgba(255,255,255,.20), inset 0 -14px 24px rgba(0,0,0,.30)",
                  fontWeight:800, fontSize:34
                }}>
                  <span style={{ opacity:.78 }}>{k}</span><span style={{ fontWeight:900 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize:34, fontWeight:900, textShadow:"0 1px 0 #000, 0 8px 26px rgba(0,0,0,.45)" }}>
              {tagline}
            </div>
          </div>

          {!hideWm && (
            <div style={{
              position:"absolute", right:28, bottom:22, padding:"8px 14px",
              borderRadius:999, border:"1.6px solid rgba(255,85,170,.55)",
              background:"linear-gradient(180deg, rgba(255,120,195,.18), rgba(0,0,0,.24))",
              boxShadow:"0 8px 18px rgba(0,0,0,.32), 0 0 18px rgba(255,85,170,.35), inset 0 1px 6px rgba(255,255,255,.18)",
              color:"#ff51b3", fontWeight:900, letterSpacing:.4, fontSize:20
            }}>
              crushai.fun
            </div>
          )}
        </div>
      ),
      { width: W, height: H }
    );
  } catch (e) {
    return new Response(`OG error: ${e.message}`, { status: 500 });
  }
}
