// pages/index.js
import Head from "next/head";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import ShareOnX from "../components/ShareOnX";
import ChatOverlay from "../components/ChatOverlay"; // full-screen overlay

// Don't SSR ChatBox to avoid hydration mismatches
const ChatBox = dynamic(() => import("../components/ChatBox"), { ssr: false });

/* ---------- META / SITE ---------- */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "";
const abs = (p) => (SITE_URL ? SITE_URL + p : p);

const EMOJIS = ["💘", "💦", "💋", "❤️", "😘"];
const LEFT_COUNT = 6;
const RIGHT_COUNT = 6;

/* ---------- PNG-first defaults (match your /public/images) ---------- */
const CUPID_LEFT_IMG = "/images/cupid_female.png";
const CUPID_RIGHT_IMG = "/images/cupid_male.png";

/* ---------- CONFIG ---------- */
const MIN_HOLD = Number(process.env.NEXT_PUBLIC_MIN_HOLD ?? "500"); // gate = 500 tokens
const CRUSH_MINT = process.env.NEXT_PUBLIC_CRUSH_MINT || ""; // REQUIRED for RPC fallback
const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const HAS_SUPABASE =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* ---------- NAME OWNERSHIP (wallet/guest binding) ---------- */
const LS_NAME = "crush_display_name";
const LS_NAME_OWNER = "crush_name_owner";
const LS_GUEST = "crush_guest_id";
const LS_WALLET = "crush_wallet";

/* ---------- ASSET RESOLVER (PNG-only + content-type guard) ---------- */
const CANDIDATE_DIRS = ["/images", "/", "/img", "/assets", "/brand"];
async function resolveAssetPath(basename, dirs = CANDIDATE_DIRS) {
  for (const dir of dirs) {
    const p = `${dir}/${basename}.png`.replace(/\/+/g, "/");
    try {
      const r = await fetch(p, { method: "HEAD", cache: "no-store" });
      const ct = (r.headers && r.headers.get("content-type")) || "";
      if (r.ok && ct.startsWith("image/")) return p;
    } catch {}
    try {
      const r2 = await fetch(p, { method: "GET", cache: "force-cache" });
      const ct2 = (r2.headers && r2.headers.get("content-type")) || "";
      if (r2.ok && ct2.startsWith("image/")) return p;
    } catch {}
  }
  return `/images/${basename}.png`;
}

function ensureGuestId() {
  let g = "";
  try {
    g = localStorage.getItem(LS_GUEST) || "";
    if (!g) {
      g = "guest_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(LS_GUEST, g);
    }
  } catch {}
  return g;
}
function currentIdentifier(wallet) {
  return wallet || localStorage.getItem(LS_WALLET) || ensureGuestId();
}

// DB guard: is this name taken by a different wallet?
async function isNameTakenByOther(name, myId) {
  if (!HAS_SUPABASE || !name) return false;
  try {
    const { data, error } = await supabase
      .from("leaderboard")
      .select("wallet,name")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (error || !data) return false;
    return data.wallet && data.wallet !== myId;
  } catch {
    return false;
  }
}
async function enforceNameOwnership(currentWallet, setDisplayName) {
  const me = currentIdentifier(currentWallet);
  const stored = (localStorage.getItem(LS_NAME) || "").trim();
  const owner = localStorage.getItem(LS_NAME_OWNER);
  if (stored && owner && owner !== me) {
    localStorage.removeItem(LS_NAME);
    localStorage.removeItem(LS_NAME_OWNER);
    setDisplayName("");
    return;
  }
  if (stored && (await isNameTakenByOther(stored, me))) {
    localStorage.removeItem(LS_NAME);
    localStorage.removeItem(LS_NAME_OWNER);
    setDisplayName("");
    return;
  }
  setDisplayName(stored || "");
}

/* ---------- helpers for client-only emoji bursts ---------- */
function getSidePositions(side, count) {
  const verticals = Array.from({ length: count }, (_, i) => 10 + i * ((80 - 10) / (count - 1)));
  const left = side === "left" ? 5 : 82;
  return verticals.map((top) => ({
    top: `${top + Math.random() * 4 - 2}%`,
    left: `${left + Math.random() * 7}%`,
  }));
}
function getRandomEmojis() {
  const emojis = [];
  let idx = 0;
  const leftEmojis = [...EMOJIS].sort(() => 0.5 - Math.random());
  const rightEmojis = [...EMOJIS].sort(() => 0.5 - Math.random());
  getSidePositions("left", LEFT_COUNT).forEach((pos) => {
    emojis.push({
      id: `l-${idx}`,
      emoji: leftEmojis[idx % EMOJIS.length],
      ...pos,
      fontSize: `${(2.5 + Math.random() * 1.3).toFixed(2)}rem`,
      rotate: `${Math.floor(Math.random() * 28 - 14)}deg`,
      side: "left",
    });
    idx++;
  });
  idx = 0;
  getSidePositions("right", RIGHT_COUNT).forEach((pos) => {
    emojis.push({
      id: `r-${idx}`,
      emoji: rightEmojis[idx % EMOJIS.length],
      ...pos,
      fontSize: `${(2.5 + Math.random() * 1.3).toFixed(2)}rem`,
      rotate: `${Math.floor(Math.random() * 28 - 14)}deg`,
      side: "right",
    });
    idx++;
  });
  return emojis;
}

/* ---------- XP labels ---------- */
const LEVEL_LABELS = [
  "Flirt Rookie",
  "Sweetheart",
  "Seduction Pro",
  "Temptation Queen/King",
  "Irresistible",
  "Heartbreaker",
  "Crush Master",
];
const XP_LEVELS = [0, 100, 400, 900, 1600, 2500, 3600];

/* ---------- Low-level RPC fallback: read SPL balance ---------- */
async function fetchTierViaRPC(owner) {
  if (!CRUSH_MINT) {
    console.warn("[CrushAI] NEXT_PUBLIC_CRUSH_MINT missing — RPC fallback disabled.");
    return { amount: 0, tierName: "FREE" };
  }
  try {
    // SPL Token Program ID (v1)
    const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        owner,
        { mint: CRUSH_MINT },
        { encoding: "jsonParsed", commitment: "confirmed" },
      ],
    };
    const r = await fetch(SOLANA_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("RPC HTTP error");
    const j = await r.json();
    const list = j?.result?.value || [];
    let total = 0;
    for (const it of list) {
      const ui = it?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
      total += Number(ui) || 0;
    }
    const amount = Number(total) || 0;
    const tierName = amount >= MIN_HOLD ? "HOLDER" : "FREE";
    return { amount, tierName };
  } catch (e) {
    console.warn("[CrushAI] RPC fallback failed:", e);
    return { amount: 0, tierName: "FREE" };
  }
}

/* ---------- Tier fetcher (API + RPC fallback) ---------- */
async function fetchTier(address) {
  const cacheKey = `crush_tier_${address}`;

  // Use cache only if positive balance (prevents “stuck at 0” on mobile)
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached && cached.expiresAt && Date.now() < cached.expiresAt && Number(cached.amount) > 0) {
      return cached;
    }
  } catch {}

  // 1) Preferred: /api/tier
  try {
    const r = await fetch(`/api/tier?address=${encodeURIComponent(address)}`, {
      headers: { "content-type": "application/json" },
      cache: "no-store",
    });
    if (r.ok) {
      const j = await r.json();
      const amount = Number(j?.uiAmount || 0);
      const tierName = j?.tier?.name || (amount >= MIN_HOLD ? "HOLDER" : "FREE");
      const payload = { amount, tierName, expiresAt: Date.now() + 60_000 };
      try { localStorage.setItem(cacheKey, JSON.stringify(payload)); } catch {}
      // If API says 0, try RPC immediately
      if (amount === 0) {
        const rpc = await fetchTierViaRPC(address);
        if (rpc.amount > 0) {
          const fixed = { ...rpc, expiresAt: Date.now() + 60_000 };
          try { localStorage.setItem(cacheKey, JSON.stringify(fixed)); } catch {}
          return fixed;
        }
      }
      return payload;
    }
  } catch {}

  // 2) Fallback: /api/holdings/verify
  try {
    const r = await fetch(`/api/holdings/verify?owner=${encodeURIComponent(address)}`, {
      headers: { "content-type": "application/json" },
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    const amount = Number(j?.amount || 0);
    const tierName = amount >= MIN_HOLD ? "HOLDER" : "FREE";
    const payload = { amount, tierName, expiresAt: Date.now() + 60_000 };
    try { localStorage.setItem(cacheKey, JSON.stringify(payload)); } catch {}

    if (amount === 0) {
      const rpc = await fetchTierViaRPC(address);
      if (rpc.amount > 0) {
        const fixed = { ...rpc, expiresAt: Date.now() + 60_000 };
        try { localStorage.setItem(cacheKey, JSON.stringify(fixed)); } catch {}
        return fixed;
      }
    }
    return payload;
  } catch {}

  // 3) Last resort: RPC
  const rpc = await fetchTierViaRPC(address);
  const payload = { ...rpc, expiresAt: Date.now() + 60_000 };
  try { localStorage.setItem(cacheKey, JSON.stringify(payload)); } catch {}
  return payload;
}

/* ---------- Floating CTA ---------- */
function FloatingCTA({ wallet, isHolder, connectWallet, openChat }) {
  function go() {
    if (!wallet) return connectWallet?.();
    if (!isHolder) return (window.location.href = "/buy");
    openChat?.();
  }
  const label = !wallet ? "Connect Phantom" : !isHolder ? "Get $CRUSH" : "Chat with Xenia";
  return (
    <button
      onClick={go}
      aria-label={label}
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 9999,
        padding: "12px 16px",
        borderRadius: 9999,
        border: "1px solid #ffd1ecaa",
        background: "linear-gradient(135deg, #ff6aa9, #e098f8)",
        color: "#fff",
        fontWeight: 800,
        boxShadow: "0 12px 28px #fa1a8166, 0 3px 10px #00000040",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [chatOpen, setChatOpen] = useState(false);

  /* ---------- WALLET + GATE ---------- */
  const [wallet, setWallet] = useState(null);
  const [holdBalance, setHoldBalance] = useState(0);
  const [tierName, setTierName] = useState("");
  const [checking, setChecking] = useState(false);
  const [gateError, setGateError] = useState("");

  /* ---------- RESOLVED IMAGE PATHS ---------- */
  const [cupidLeftSrc, setCupidLeftSrc] = useState(CUPID_LEFT_IMG);
  const [cupidRightSrc, setCupidRightSrc] = useState(CUPID_RIGHT_IMG);
  const [unlock1Src, setUnlock1Src] = useState("/images/nsfw1_blurred.png");
  const [unlock2Src, setUnlock2Src] = useState("/images/nsfw2_blurred.png");

  useEffect(() => {
    if (!mounted) return;
    (async () => {
      const [l, r, u1, u2] = await Promise.all([
        resolveAssetPath("cupid_female"),
        resolveAssetPath("cupid_male"),
        resolveAssetPath("nsfw1_blurred"),
        resolveAssetPath("nsfw2_blurred"),
      ]);
      setCupidLeftSrc(l); setCupidRightSrc(r);
      setUnlock1Src(u1); setUnlock2Src(u2);
    })();
  }, [mounted]);

  async function connectWallet() {
    try {
      setGateError("");
      if (!window?.solana?.isPhantom) {
        setGateError("Phantom not found. Install Phantom to continue.");
        return;
      }
      const resp = await window.solana.connect({ onlyIfTrusted: false });
      const pubkey = resp?.publicKey?.toString();
      if (!pubkey) throw new Error("No public key");
      setWallet(pubkey);
      try { localStorage.setItem(LS_WALLET, pubkey); } catch {}
      await refreshBalance(pubkey);                 // immediate
      setTimeout(() => refreshBalance(pubkey), 1500); // mobile recheck
      enforceNameOwnership(pubkey, setDisplayName);
    } catch (e) {
      setGateError(e?.message || "Failed to connect wallet");
    }
  }

  async function disconnectWallet() {
    try { await window?.solana?.disconnect?.(); } catch {}
    setWallet(null);
    setHoldBalance(0);
    setTierName("");
    try { localStorage.removeItem(LS_WALLET); } catch {}
    enforceNameOwnership(null, setDisplayName);
  }

  async function refreshBalance(pubkey = wallet) {
    if (!pubkey) return;
    setChecking(true);
    setGateError("");
    try {
      const { amount, tierName } = await fetchTier(pubkey);
      setHoldBalance(Number(amount) || 0);
      setTierName(tierName || "");
    } catch {
      setGateError("Balance check failed. Try again.");
    } finally {
      setChecking(false);
    }
  }

  // Auto-restore + trusted reconnect
  useEffect(() => {
    if (!mounted) return;
    const stored = localStorage.getItem(LS_WALLET);
    if (stored) {
      setWallet(stored);
      refreshBalance(stored);
      setTimeout(() => refreshBalance(stored), 1500); // defeat stale cache
      enforceNameOwnership(stored, setDisplayName);
    } else if (window?.solana?.isPhantom) {
      window.solana
        .connect({ onlyIfTrusted: true })
        .then((r) => {
          const pk = r?.publicKey?.toString();
          if (pk) {
            setWallet(pk);
            try { localStorage.setItem(LS_WALLET, pk); } catch {}
            refreshBalance(pk);
            setTimeout(() => refreshBalance(pk), 1500);
            enforceNameOwnership(pk, setDisplayName);
          } else {
            enforceNameOwnership(null, setDisplayName);
          }
        })
        .catch(() => enforceNameOwnership(null, setDisplayName));
    } else {
      enforceNameOwnership(null, setDisplayName);
    }
  }, [mounted]);

  const isHolder = !!wallet && Number(holdBalance) >= MIN_HOLD;

  /* ---------- XP ---------- */
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(0);
  const [levelUp, setLevelUp] = useState(false);
  useEffect(() => {
    if (!mounted) return;
    try {
      const savedXp = localStorage.getItem("crush_xp");
      const savedLevel = localStorage.getItem("crush_level");
      setXp(savedXp ? parseInt(savedXp, 10) : 0);
      setLevel(savedLevel ? parseInt(savedLevel, 10) : 0);
    } catch {}
  }, [mounted]);

  const [displayName, setDisplayName] = useState("");
  function isValidDisplayName(s) {
    return /^[\p{L}\p{N} ._-]{2,24}$/u.test(s) && !/^anonymous$/i.test(s);
  }
  async function claimOrEditDisplayName() {
    const current = (localStorage.getItem(LS_NAME) || "").trim();
    const proposed = prompt(current ? "Edit your display name" : "Claim your display name", current);
    if (proposed == null) return;
    const name = proposed.trim();
    if (!isValidDisplayName(name)) {
      alert("2–24 letters, numbers, space, . _ -  (and not 'anonymous')");
      return;
    }
    const me = currentIdentifier(wallet);
    if (await isNameTakenByOther(name, me)) {
      alert("That name is already taken by another wallet.");
      return;
    }
    try {
      localStorage.setItem(LS_NAME, name);
      localStorage.setItem(LS_NAME_OWNER, me);
    } catch {}
    setDisplayName(name);
    try { await updateLeaderboard(xp, level); } catch {}
  }

  async function updateLeaderboard(newXp, newLevel) {
    if (!HAS_SUPABASE) return;
    try {
      const walletId =
        localStorage.getItem(LS_WALLET) ||
        (function () {
          let g = localStorage.getItem(LS_GUEST);
          if (!g) {
            g = "guest_" + Math.random().toString(36).slice(2, 10);
            localStorage.setItem(LS_GUEST, g);
          }
          return g;
        })();

      const display = (localStorage.getItem(LS_NAME) || "").trim();
      const owner = localStorage.getItem(LS_NAME_OWNER);

      const payload = {
        wallet: walletId,
        xp: newXp,
        level: newLevel,
        updated_at: new Date(),
      };
      if (display && owner === walletId) payload.name = display;

      const { error } = await supabase
        .from("leaderboard")
        .upsert(payload, { onConflict: "wallet" });
      if (error) console.error("Supabase update failed:", error);
    } catch (e) {
      console.warn("Skipping Supabase sync:", e);
    }
  }

  function handleXpGain(message) {
    const containsEmoji = /[\u{1F300}-\u{1FAFF}]/u.test(message);
    const amount = containsEmoji ? 20 : 10;
    setXp((prev) => {
      let newXp = prev + amount;
      let newLevel = level;
      while (XP_LEVELS[newLevel + 1] && newXp >= XP_LEVELS[newLevel + 1]) {
        newLevel++;
        setLevelUp(true);
        setTimeout(() => setLevelUp(false), 1600);
      }
      setLevel(newLevel);
      try {
        localStorage.setItem("crush_xp", String(newXp));
        localStorage.setItem("crush_level", String(newLevel));
      } catch {}
      updateLeaderboard(newXp, newLevel);
      return newXp;
    });
  }

  const nextLevelXp = XP_LEVELS[level + 1] || xp + 100;
  const currentLevelXp = XP_LEVELS[level] || 0;
  const barPercent = Math.min(
    100,
    Math.round(((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100)
  );

  /* ---------- FX ---------- */
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [arrowKey, setArrowKey] = useState(0);
  const [arrowVisible, setArrowVisible] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let arrowTimeout = null;
    const interval = setInterval(() => {
      setArrowKey((k) => k + 1);
      setArrowVisible(true);
      arrowTimeout = setTimeout(() => setArrowVisible(false), 1700);
    }, 9000);
    setArrowVisible(false);
    return () => {
      clearInterval(interval);
      if (arrowTimeout) clearTimeout(arrowTimeout);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timeout;
    function burst() {
      setFloatingEmojis([]);
      setTimeout(() => setFloatingEmojis(getRandomEmojis()), 50);
      timeout = setTimeout(burst, 1800);
    }
    burst();
    return () => clearTimeout(timeout);
  }, [mounted]);

  useEffect(() => {
    function onVis() { setArrowKey((k) => k); }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <>
      <Head>
        <title>Crush AI 💘</title>
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@CrushAIx" />
        <meta property="og:title" content="Crush AI" />
        <meta property="og:description" content="Your flirty AI companion 💘" />
        <meta property="og:image" content={abs("/brand/x-banner.png")} />
        <meta name="twitter:image" content={abs("/brand/x-banner.png")} />
      </Head>

      {mounted && (
        <Head>
          <link rel="preload" as="image" href={cupidLeftSrc} />
          <link rel="preload" as="image" href={cupidRightSrc} />
        </Head>
      )}

      {mounted && (
        <div className="pointer-events-none fixed inset-0 z-30" aria-hidden="true">
          {floatingEmojis.map(({ id, emoji, top, left, fontSize, rotate }) => (
            <span
              key={id}
              className="floating-flash-emoji"
              style={{ top, left, fontSize, position: "absolute", transform: `rotate(${rotate})`, opacity: 1 }}
            >
              {emoji}
            </span>
          ))}
        </div>
      )}

      <div style={{ position: "fixed", width: "100%", left: 0, top: 0, pointerEvents: "none", zIndex: 40 }}>
        <img
          src={cupidLeftSrc}
          fetchpriority="high"
          alt=""
          aria-hidden="true"
          className="cupid-img cupid-left"
          loading="eager"
          decoding="async"
          onError={() => resolveAssetPath("cupid_female").then(setCupidLeftSrc)}
          style={{ animation: "cupid-float 5.8s ease-in-out infinite", transform: "scaleX(1)" }}
        />
        <img
          src={cupidRightSrc}
          fetchpriority="high"
          alt=""
          aria-hidden="true"
          className="cupid-img cupid-right"
          loading="eager"
          decoding="async"
          onError={() => resolveAssetPath("cupid_male").then(setCupidRightSrc)}
          style={{ animation: "cupid-float 6.1s ease-in-out infinite", transform: "scaleX(1)" }}
        />
        {mounted && arrowVisible && (
          <span
            key={arrowKey}
            className="cupid-arrow"
            style={{
              left: "11vw",
              top: "112px",
              fontSize: "2.5rem",
              fontWeight: 700,
              color: "#fa1a81",
              textShadow: "0 0 10px #fa1a81, 0 0 24px #fff0fc",
              animation: "arrow-fly-right 1.7s linear forwards",
              pointerEvents: "none",
              userSelect: "none",
              position: "absolute",
            }}
          >
            ➳💘
          </span>
        )}
      </div>

      {mounted && (
        <div className="absolute inset-0 overflow-hidden z-0" aria-hidden="true">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="sparkle"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* SOCIAL BAR */}
      <div
        className="crush-social-bar-centered"
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "28px",
          margin: "0 auto",
          marginTop: "5.6rem",
          marginBottom: "-8px",
          zIndex: 20,
          position: "relative",
        }}
      >
        <a href="https://x.com/CrushAIx" target="_blank" rel="noopener noreferrer" className="crush-social-btn" aria-label="X">
          <svg width="28" height="28" fill="none" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="16" fill="none" />
            <path d="M7 7L25 25M25 7L7 25" stroke="#fa1a81" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </a>
        <a href="https://www.instagram.com/crusha.i" target="_blank" rel="noopener noreferrer" className="crush-social-btn" aria-label="Instagram">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect x="6" y="6" width="20" height="20" rx="6" stroke="#fa1a81" strokeWidth="2" />
            <circle cx="16" cy="16" r="6" stroke="#fa1a81" strokeWidth="2" />
            <circle cx="22.2" cy="9.8" r="1.2" fill="#fa1a81" />
          </svg>
        </a>
        <a href="https://www.tiktok.com/@crush.ai30" target="_blank" rel="noopener noreferrer" className="crush-social-btn" aria-label="TikTok">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <path d="M18 9V22C18 24 16 25 14 25C12 25 10 24 10 22C10 20 12 19 14 19" stroke="#fa1a81" strokeWidth="2" strokeLinecap="round" />
            <circle cx="22" cy="10" r="2" fill="#fa1a81" />
          </svg>
        </a>
        <a href="https://discord.gg/95FeAK9cye" target="_blank" rel="noopener noreferrer" className="crush-social-btn" aria-label="Discord">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect x="8" y="12" width="16" height="8" rx="4" stroke="#fa1a81" strokeWidth="2" />
            <circle cx="13" cy="16" r="1.2" fill="#fa1a81" />
            <circle cx="19" cy="16" r="1.2" fill="#fa1a81" />
          </svg>
        </a>
      </div>

      {/* Main Section */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[90vh] p-4" style={{ marginTop: "0px" }}>
        <div className="flex flex-col items-center mb-2" style={{ marginTop: "1px" }}>
          <div className="crush-title-animate flex items-center justify-center">
            <span className="crush-title-heart mr-2">💘</span>
            <h1 className="title-glow text-5xl font-bold text-white crush-title-text" style={{ display: "inline-block" }}>
              Crush AI
            </h1>
          </div>
        </div>

        <div className="mb-6 neon-tagline text-lg text-center max-w-xl flex items-center justify-center gap-2">
          <span
            className="lips-emoji-animate"
            style={{ fontSize: "2.5rem", marginRight: "0.32em", display: "inline-block", verticalAlign: "middle" }}
            role="img"
            aria-label="lips"
          >
            💋
          </span>
          <span>Your flirty AI companion is ready to tease you under the stars...</span>
          <span
            className="kiss-emoji-animate"
            style={{ fontSize: "2.5rem", marginLeft: "0.32em", display: "inline-block", verticalAlign: "middle" }}
            role="img"
            aria-label="kiss"
          >
            {" "}
            😘
          </span>
        </div>

        {/* XP BAR & LEVEL */}
        <div className="flirt-xp-bar-outer">
          <div className="flirt-xp-label">
            <div className="flirt-xp-badge">
              {mounted ? (
                <>
                  💖 Flirt Level {level + 1}: <b>{LEVEL_LABELS[level] || "Legend"}</b>
                </>
              ) : (
                <>
                  💖 Flirt Level …: <b>…</b>
                </>
              )}
            </div>
          </div>
          <div className="flirt-xp-bar-bg">
            {mounted && (
              <div
                className="flirt-xp-bar"
                style={{
                  width: `${barPercent}%`,
                  background: `linear-gradient(90deg,#fa1a81,#ffb6d5,#e098f8,#b5fffc)`,
                  transition: "width 0.4s ease",
                  boxShadow: levelUp ? "0 0 16px #fa1a81aa" : "",
                }}
              />
            )}
          </div>
          {mounted && levelUp && <div className="flirt-xp-pop">✨ Level Up! ✨</div>}
        </div>

        {/* Name + Share */}
        <div
          style={{
            marginTop: 8,
            marginBottom: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          {/* Claim/Edit name */}
          {/* ... unchanged for brevity (kept in full file) */}
        </div>

        {/* ---------- TOKEN GATE PANEL ---------- */}
        {!isHolder && (
          <div className="chatbox-panel-wrapper">
            <div className="chatbox-panel chatbox-glass" style={{ padding: "1.2rem" }}>
              <div className="shimmer"></div>
              <div className="text-white text-center">
                <div className="text-2xl font-bold mb-1">🔒 Hold $CRUSH to Chat</div>
                <div className="text-pink-100/90 mb-2">
                  Connect Phantom and hold at least <b>{MIN_HOLD}</b> $CRUSH to unlock Xenia.
                </div>

                <div className="flex items-center justify-center gap-2 mb-3">
                  {!wallet ? (
                    <button className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold" onClick={connectWallet}>
                      Connect Phantom
                    </button>
                  ) : (
                    <>
                      <div className="px-3 py-2 rounded-xl bg-black/30 border border-pink-300/30 text-sm">
                        <span className="opacity-80">Wallet:</span>{" "}
                        <span className="font-mono">
                          {wallet.slice(0, 4)}…{wallet.slice(-4)}
                        </span>
                      </div>
                      <button
                        onClick={disconnectWallet}
                        className="px-3 py-2 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 text-white text-sm border border-pink-300/40"
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                </div>

                <div className="mb-3">
                  <button
                    onClick={() => refreshBalance()}
                    disabled={!wallet || checking}
                    className="px-4 py-2 rounded-xl bg-pink-500 text-white font-semibold disabled:opacity-60"
                  >
                    {checking ? "Checking…" : "Refresh Balance"}
                  </button>
                </div>

                <div className="text-pink-50">
                  Your $CRUSH: <b>{Number(holdBalance).toLocaleString()}</b>
                  {tierName ? (
                    <span className="opacity-90"> &nbsp;•&nbsp; Tier: <b>{tierName}</b></span>
                  ) : null}
                  {wallet && (
                    <span className="opacity-80">
                      {" "}
                      &nbsp;|&nbsp; Need: <b>{MIN_HOLD}</b>
                    </span>
                  )}
                </div>

                {/* Manual safety override in case mobile cache misbehaves */}
                {wallet && Number(holdBalance) >= MIN_HOLD && (
                  <button
                    onClick={() => setChatOpen(true)}
                    className="px-4 py-2 mt-3 rounded-xl bg-green-500 text-white font-bold"
                  >
                    Enter Chat (override)
                  </button>
                )}

                {gateError && <div className="mt-3 text-sm text-pink-200/90">{gateError}</div>}
              </div>
            </div>
          </div>
        )}

        {/* Unlock Cards (unchanged) */}
        {/* ... */}

        <FloatingCTA wallet={wallet} isHolder={isHolder} connectWallet={connectWallet} openChat={() => setChatOpen(true)} />
      </main>

      {/* ---------- FULL-SCREEN CHAT OVERLAY ---------- */}
      <ChatOverlay open={isHolder && chatOpen} onClose={() => setChatOpen(false)}>
        <ChatBox
          personaName="Xenia"
          stream={true}
          wallet={wallet}
          onMessageSent={handleXpGain}
          cooldownSeconds={10}
          className="mx-auto"
        />
      </ChatOverlay>

      {/* ---------- STYLES (unchanged) ---------- */}
      <style jsx global>{`
        /* (styles unchanged – keeping your look) */
        .floating-flash-emoji{opacity:0;transition:opacity .36s cubic-bezier(.62,.08,.2,.98);animation:fade-flash 2s forwards;pointer-events:none;filter:drop-shadow(0 0 9px #d96de7aa);z-index:30}
        @keyframes fade-flash{0%{opacity:0}15%{opacity:1}85%{opacity:1}100%{opacity:0}}
        .kiss-emoji-animate{animation:kiss-pop 2.3s infinite cubic-bezier(.52,-.19,.7,1.41)}
        @keyframes kiss-pop{0%,100%{transform:scale(1) rotate(-7deg)}7%{transform:scale(1.07) rotate(-5deg)}14%{transform:scale(1.23) rotate(9deg)}23%{transform:scale(1.08) rotate(-2deg)}32%{transform:scale(1) rotate(2deg)}70%{transform:scale(1.13) rotate(0)}}
        .lips-emoji-animate{animation:lips-bounce 1.8s infinite cubic-bezier(.32,-.29,.7,1.41)}
        @keyframes lips-bounce{0%,100%{transform:scale(1)}13%{transform:scale(1.23)}27%{transform:scale(.97)}54%{transform:scale(1.13)}70%{transform:scale(1.09)}}
        .chatbox-glass{background:linear-gradient(135deg,#ffb6d5ee 10%,#fa1a81cc 100%);box-shadow:0 4px 32px #fa1a81aa,0 2px 18px #b5fffc55;border:2.5px solid #fff0fc55;backdrop-filter:blur(7px) saturate(1.08);outline:1.5px solid #ffd1ec88;outline-offset:3px}
        .chatbox-panel{background:transparent!important;border-radius:1.5em;box-shadow:none;padding:1.2em .55em;position:relative;z-index:4}
        .shimmer{position:absolute;inset:0;background:linear-gradient(120deg,#ffd1ec11 20%,#ffb6d577 44%,#e098f844 66%,#b5fffc11 100%);opacity:.7;pointer-events:none}
        .flirt-xp-bar-outer{margin:.7rem 0 1.5rem 0;width:360px;max-width:95vw}
        .flirt-xp-label{display:flex;justify-content:space-between;align-items:center;font-size:1.04rem;color:#ffb6d5;margin-bottom:.15em}
        .flirt-xp-badge{background:#fa1a81cc;border-radius:9999px;padding:.18em .98em;color:#fff;font-weight:600;box-shadow:0 2px 12px #fa1a8126;font-size:1.1rem}
        .flirt-xp-bar-bg{background:#faf5fc42;border-radius:9999px;height:18px;width:100%;overflow:hidden}
        .flirt-xp-bar{height:100%;border-radius:9999px}
        .flirt-xp-pop{margin-top:.22em;text-align:center;color:#fff0fc;text-shadow:0 0 10px #fa1a81,0 0 24px #fff0fc;animation:pop-scale 1.2s}
        @keyframes pop-scale{0%{transform:scale(1)}22%{transform:scale(1.22)}57%{transform:scale(.98)}100%{transform:scale(1)}
        }
        .sparkle{position:absolute;width:5px;height:5px;border-radius:99px;background:linear-gradient(120deg,#fff0fc,#ffd1ec,#fa1a81 66%,#e098f8);opacity:.36;box-shadow:0 0 11px 3px #ffd1eccc,0 0 2px 1px #fff;animation:sparkle-pop 4.9s infinite cubic-bezier(.62,-.19,.7,1.21)}
        @keyframes sparkle-pop{0%{opacity:.1;transform:scale(.97)}14%{opacity:.66;transform:scale(1.32)}50%{opacity:.92}86%{opacity:.46;transform:scale(.86)}100%{opacity:.13}}
        .cupid-img{position:absolute;width:108px;height:auto;z-index:41}
        .cupid-left{top:110px;left:6vw}
        .cupid-right{top:114px;right:6vw}
        @keyframes arrow-fly-right{0%{left:11vw;opacity:0}10%{left:13vw;opacity:1}87%{left:74vw;opacity:1}100%{left:80vw;opacity:0}}
        .cupid-arrow{position:absolute;z-index:24}
        .crush-title-animate{animation:crush-title-bounce 1.32s cubic-bezier(.58,-.16,.6,1.54) infinite}
        @media (max-width:480px){.flirt-xp-bar-outer{width:92vw;margin:1rem auto 1.6rem}.crush-social-bar-centered{margin-top:4.6rem}.cupid-img{width:88px}.cupid-left{left:2vw;top:96px}.cupid-right{right:2vw;top:100px}}
        @media (prefers-reduced-motion:reduce){.floating-flash-emoji,.kiss-emoji-animate,.lips-emoji-animate,.cupid-img,.crush-title-animate,.cupid-arrow,.sparkle{animation:none!important;transition:none!important}}
      `}</style>
    </>
  );
}
