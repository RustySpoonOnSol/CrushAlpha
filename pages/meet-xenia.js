// pages/meet-xenia.js
import Head from "next/head";
import Link from "next/link";
import { useEffect, useState, useMemo, useRef } from "react";
import ShareOnX from "../components/ShareOnX";

/** ===== Config ===== */
const MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";

/* RPC rotation with safe fallback */
const HELIUS_KEY = process.env.NEXT_PUBLIC_HELIUS_KEY || "";
const RPCS_RAW = [
  process.env.NEXT_PUBLIC_SOLANA_RPC || "",
  HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);
const RPCS = RPCS_RAW.length ? RPCS_RAW : ["https://api.mainnet-beta.solana.com"];

// Global thresholds (align with site + env)
const CHAT_MIN_HOLD = Number(process.env.NEXT_PUBLIC_MIN_HOLD ?? "500");
const NSFW_HOLD = Number(process.env.NEXT_PUBLIC_NSFW_HOLD ?? "2000");
const GODDESS_HOLD = Number(process.env.NEXT_PUBLIC_GODDESS_HOLD ?? "5000");

// (Optional) display only — real routing to treasury is done server-side in /api/pay/create
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "";

/** ===== Content Catalog ===== */
const VAULT = [
  // ===== FREE TEASERS =====
  {
    id: "free-teasers-01",
    type: "images",
    title: "Free Teasers · 01",
    blurb: "A little taste — no $CRUSH required.",
    minHold: 0,
    images: [
      { src: "/xenia/free/free-01.png", alt: "Xenia — free teaser 1" },
      { src: "/xenia/free/free-02.png", alt: "Xenia — free teaser 2" },
    ],
  },

  // ===== TEXT / SFW =====
  {
    id: "opener-pack-01",
    type: "text",
    title: "Playful Opener Pack (10 lines)",
    blurb: "Short, cheeky openers Xenia actually likes.",
    minHold: 0,
    content: [
      "Rate my vibe: sweet, spicy, or dangerously charming? 😏",
      "Convince me you’re trouble—in two emojis.",
      "Give me one reason to break my rules tonight ✨",
      "If I steal your hoodie, what’s my punishment?",
      "Truth or dare—PG to start… maybe.",
      "Teach me your best wink. I’ll grade you 😘",
      "I bet you blush easily. Prove me wrong.",
      "Describe our first 10 seconds. Make it cinematic.",
      "What nickname do I earn if I surprise you?",
      "Guess my favorite bad habit. Winner gets a secret.",
    ],
  },
  {
    id: "tease-script-neon",
    type: "text",
    title: "Tease Script: Neon Kiss",
    blurb: "A short, suggestive scene—classy, not explicit.",
    minHold: CHAT_MIN_HOLD,
    content: [
      "Neon spills across my shoulders as I lean in—close enough to count your breaths.",
      "“One step closer, and I’ll make you earn it,” I whisper, smiling with my eyes.",
      "Your hand hovers—bold, but waiting. Good. I like patience… until I don’t.",
    ],
  },

  // ===== HOLD-GATED SFW SET =====
  {
    id: "sfw-tease-set",
    type: "images",
    title: "SFW Tease Set · 01",
    blurb: "Playful poses — perfect for your lockscreen.",
    minHold: CHAT_MIN_HOLD,
    images: [
      { src: "/xenia/sfw/tease-01.png", alt: "Xenia — playful pose" },
      { src: "/xenia/sfw/tease-02.png", alt: "Xenia — wink" },
      { src: "/xenia/sfw/tease-03.png", alt: "Xenia — neon glow" },
    ],
  },

  // ===== MULTIPLE HOLD-TIER IMAGE SETS =====
  {
    id: "hold-1000",
    type: "images",
    title: "Holder Tier · 1,000+",
    blurb: "Unlocked by holding ≥ 1,000 $CRUSH.",
    minHold: 1000,
    images: [
      { src: "/xenia/hold/h1-01.png", alt: "Xenia — 1k holders set 1" },
      { src: "/xenia/hold/h1-02.png", alt: "Xenia — 1k holders set 2" },
    ],
  },
  {
    id: "hold-3000",
    type: "images",
    title: "Holder Tier · 3,000+",
    blurb: "Unlocked by holding ≥ 3,000 $CRUSH.",
    minHold: 3000,
    images: [
      { src: "/xenia/hold/h3-01.png", alt: "Xenia — 3k holders set 1" },
      { src: "/xenia/hold/h3-02.png", alt: "Xenia — 3k holders set 2" },
    ],
  },
  {
    id: "hold-7000",
    type: "images",
    title: "Holder Tier · 7,000+",
    blurb: "Unlocked by holding ≥ 7,000 $CRUSH.",
    minHold: 7000,
    images: [
      { src: "/xenia/hold/h7-01.png", alt: "Xenia — 7k holders set 1" },
      { src: "/xenia/hold/h7-02.png", alt: "Xenia — 7k holders set 2" },
    ],
  },

  // ===== PAY-PER-IMAGE; FREE FOR BIG HOLDERS OR PER-IMAGE OVERRIDE =====
  {
    id: "vip-gallery-01",
    type: "pay-images",
    title: "VIP Gallery Drop · 01",
    blurb: "Exclusive set. Pay per-image to unlock, or hold enough $CRUSH for free access.",
    minHold: 0,
    images: [
      { id: "vip-gallery-01-1", title: "VIP Photo 01", priceCrush: 250, preview: "/xenia/nsfw/nsfw-01-blur.png", freeIfHold: 2000 },
      { id: "vip-gallery-01-2", title: "VIP Photo 02", priceCrush: 300, preview: "/xenia/nsfw/nsfw-02-blur.png", freeIfHold: 3000 },
      { id: "vip-gallery-01-3", title: "VIP Photo 03", priceCrush: 400, preview: "/xenia/nsfw/nsfw-03-blur.png", freeIfHold: 5000 },
    ],
  },
  {
    id: "pp-gallery-02",
    type: "pay-images",
    title: "Purchase-Only Gallery · 02",
    blurb: "Each photo can be unlocked individually with $CRUSH. Payments go to treasury.",
    minHold: 0,
    images: [
      { id: "pp-02-1", title: "Photo A", priceCrush: 500, preview: "/xenia/pp/pp-01-blur.png" },
      { id: "pp-02-2", title: "Photo B", priceCrush: 750, preview: "/xenia/pp/pp-02-blur.png", freeIfHold: 3500 },
      { id: "pp-02-3", title: "Photo C", priceCrush: 1000, preview: "/xenia/pp/pp-03-blur.png" },
    ],
  },

  // ===== BUNDLE =====
  {
    id: "bundle-vip-01",
    type: "bundle",
    title: "Bundle: VIP Gallery 01 (All)",
    blurb: "Unlock all three VIP photos for less.",
    minHold: 0,
    priceCrush: 600, // UI only; server validates actual price
    children: ["vip-gallery-01-1", "vip-gallery-01-2", "vip-gallery-01-3"],
  },

  // ===== CTA =====
  {
    id: "custom-goddess",
    type: "cta",
    title: "Goddess Custom Scene",
    blurb: "Co-create a bespoke experience with Xenia.",
    minHold: GODDESS_HOLD,
    ctaHref: "/whitepaper",
    ctaLabel: "Read how customs work →",
  },
];

/** ===== Small UI: Toasts ===== */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const push = (msg) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  };
  const ui = (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold shadow-lg border border-emerald-300/40"
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
  return { push, ui };
}

/** ===== RPC helpers ===== */
async function fetchWithTimeout(url, init = {}, ms = 8000) {
  return Promise.race([
    fetch(url, init),
    new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), ms)),
  ]);
}
async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const headers = { "content-type": "application/json" };
  let lastErr;
  for (const endpoint of RPCS) {
    try {
      const r = await fetchWithTimeout(endpoint, { method: "POST", headers, body }, 8000);
      const j = await r.json();
      if (j.error) throw new Error(j.error?.message || "RPC error");
      return j.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("All RPCs failed");
}
async function getCrushBalance(owner, mint) {
  const res = await rpc("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed" }]);
  let total = 0;
  for (const v of (res?.value || [])) total += Number(v?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
  return total;
}

/** ===== Pay & Verify ===== */
async function createPayment({ wallet, itemId, ref }) {
  const r = await fetch("/api/pay/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, itemId, ref, treasury: true }),
  });
  if (!r.ok) throw new Error("Create payment failed");
  return r.json();
}
async function verifyPayment({ wallet, itemId, reference }) {
  const qs = new URLSearchParams({ wallet, itemId, reference });
  const r = await fetch(`/api/pay/verify?${qs.toString()}`);
  if (!r.ok) return { ok: false };
  return r.json();
}

/** ===== Entitlements ===== */
async function fetchEntitlements(wallet) {
  const r = await fetch(`/api/entitlements?wallet=${encodeURIComponent(wallet)}`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.items || []).map((x) => x.itemId);
}

/** ===== Auth (signed session) ===== */
async function getChallenge(wallet) {
  const r = await fetch(`/api/auth/challenge?wallet=${encodeURIComponent(wallet)}`);
  if (!r.ok) throw new Error("Challenge failed");
  return r.json(); // { wallet, nonce, ts, message }
}
async function postVerify(body) {
  const r = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Verify failed");
  return r.json();
}
async function getMe() {
  const r = await fetch("/api/auth/me");
  if (!r.ok) return { authed: false };
  return r.json();
}
async function logoutSession() { try { await fetch("/api/auth/logout"); } catch {} }
function bytesToBase64(bytes) {
  let bin = "";
  const arr = Array.from(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

/** ===== Page ===== */
export default function MeetXenia() {
  const [mounted, setMounted] = useState(false);

  // wallet / auth
  const [wallet, setWallet] = useState("");
  const [authed, setAuthed] = useState(false);

  // balance & UX
  const [hold, setHold] = useState(0);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");
  const [unlockedMap, setUnlockedMap] = useState({});
  const [reducedMotion, setReducedMotion] = useState(false);

  // viral ref
  const [refCode, setRefCode] = useState("");

  // toasts
  const { push: toast, ui: toastUI } = useToasts();
  const prevHoldRef = useRef(0);

  useEffect(() => {
    setMounted(true);
    try { setReducedMotion(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches); } catch {}

    // capture ?ref= from URL, persist, and use thereafter
    try {
      const u = new URL(window.location.href);
      const ref = u.searchParams.get("ref");
      const saved = localStorage.getItem("crush_ref") || "";
      if (ref && ref !== saved) {
        localStorage.setItem("crush_ref", ref);
        setRefCode(ref);
      } else if (saved) {
        setRefCode(saved);
      }
    } catch {}
  }, []);

  const setActiveWallet = async (pk) => {
    setWallet(pk); setAuthed(false); setHold(0); setUnlockedMap({});
    try { localStorage.setItem("crush_wallet", pk); } catch {}
    await refreshHold(pk);
    try {
      const ids = await fetchEntitlements(pk);
      setUnlockedMap((m) => { const next = { ...m }; for (const id of ids) next[id] = true; return next; });
    } catch {}
    try { const me = await getMe(); setAuthed(me.authed && me.wallet === pk); } catch {}
  };

  useEffect(() => {
    if (!mounted) return;
    const stored = localStorage.getItem("crush_wallet") || "";

    if (window?.solana?.isPhantom) {
      const onAcct = async (pubkey) => {
        const next = pubkey?.toString?.() || pubkey || "";
        await logoutSession();
        if (!next) {
          setWallet(""); setAuthed(false); setHold(0); setUnlockedMap({});
          try { localStorage.removeItem("crush_wallet"); } catch {}
        } else if (next !== wallet) {
          await setActiveWallet(next);
        }
      };
      try { window.solana.on?.("accountChanged", onAcct); } catch {}

      window.solana.connect({ onlyIfTrusted: true }).then(async (r) => {
        const pk = r?.publicKey?.toString();
        if (pk) await setActiveWallet(pk);
        else if (stored) await setActiveWallet(stored);
      }).catch(async () => { if (stored) await setActiveWallet(stored); });

      return () => { try { window.solana.removeListener?.("accountChanged", onAcct); } catch {} };
    }

    if (stored) setActiveWallet(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  async function connectWallet() {
    try {
      setErr("");
      if (!window?.solana?.isPhantom) {
        setErr("Phantom not found. Install Phantom to continue.");
        return;
      }
      const r = await window.solana.connect({ onlyIfTrusted: false });
      const pk = r?.publicKey?.toString();
      if (!pk) throw new Error("No public key");
      await setActiveWallet(pk);
    } catch (e) {
      setErr(e?.message || "Failed to connect wallet");
    }
  }

  async function secureLogin() {
    try {
      if (!wallet) return setErr("Connect wallet first");
      if (!window.solana?.signMessage) return setErr("This wallet does not support signMessage");

      const ch = await getChallenge(wallet);
      const msgBytes = new TextEncoder().encode(ch.message);
      const sig = await window.solana.signMessage(msgBytes, "utf8");
      const signatureBase64 = bytesToBase64(new Uint8Array(sig.signature));

      const v = await postVerify({ wallet, signatureBase64, nonce: ch.nonce, ts: ch.ts });
      if (v?.ok) { setAuthed(true); toast("🔐 Secure login complete"); }
    } catch (e) {
      setErr(e?.message || "Secure login failed");
    }
  }

  async function refreshHold(pk = wallet) {
    if (!pk) return;
    setChecking(true);
    setErr("");
    try {
      const bal = await getCrushBalance(pk, MINT);
      setHold(bal);
      // toast when crossing chat threshold
      if (prevHoldRef.current < CHAT_MIN_HOLD && bal >= CHAT_MIN_HOLD) {
        toast("✅ Chat unlocked — go flirt!");
      }
      prevHoldRef.current = bal;
    } catch {
      setErr("Balance check failed. Try again.");
    } finally {
      setChecking(false);
    }
  }

  async function syncAndRefresh() {
    try {
      if (window?.solana?.isPhantom) {
        const r = await window.solana.connect({ onlyIfTrusted: true });
        const pk = r?.publicKey?.toString();
        if (pk && pk !== wallet) { await logoutSession(); await setActiveWallet(pk); return; }
        if (!pk && wallet) { await logoutSession(); setWallet(""); setAuthed(false); setHold(0); setUnlockedMap({}); return; }
      }
    } catch {}
    await refreshHold(wallet);
    try { const me = await getMe(); setAuthed(me.authed && me.wallet === wallet); } catch {}
  }

  const chatUnlocked = hold >= CHAT_MIN_HOLD;
  const vaultWithNeed = useMemo(() => VAULT.map((it) => ({ ...it, needed: Math.max(0, it.minHold - hold) })), [hold]);

  return (
    <>
      <Head>
        <title>Meet Xenia | Crush AI</title>
        <meta name="description" content="Xenia is your flirty AI girlfriend. Unlock hotter tiers with $CRUSH." />

        {/* speed: networking warmups */}
        <link rel="preconnect" href="https://api.mainnet-beta.solana.com" crossOrigin="" />
        {process.env.NEXT_PUBLIC_HELIUS_KEY && (
          <link rel="preconnect" href="https://mainnet.helius-rpc.com" crossOrigin="" />
        )}
        <link rel="dns-prefetch" href="https://api.mainnet-beta.solana.com" />
        <link rel="dns-prefetch" href="https://mainnet.helius-rpc.com" />
      </Head>

      {/* Sticky status bar */}
      <div className="sticky top-0 z-50 backdrop-blur-[6px] bg-[rgba(20,9,25,0.35)] border-b border-pink-300/20">
        <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap gap-2 items-center">
          <h2 className="text-white/90 font-bold mr-2">Meet Xenia</h2>
          <div className="text-pink-100/90 text-sm mr-auto">Balance: <b>{hold.toLocaleString()}</b> $CRUSH</div>
          {!wallet ? (
            <button onClick={connectWallet} className="px-3 py-1.5 rounded-xl bg-pink-600 text-white text-sm font-semibold hover:bg-pink-500">
              Connect Phantom
            </button>
          ) : (
            <>
              {!authed ? (
                <button onClick={secureLogin} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold">Secure Login</button>
              ) : (
                <span className="px-3 py-1.5 rounded-xl bg-emerald-600/30 border border-emerald-400/40 text-emerald-100 text-xs">
                  Session active
                </span>
              )}
              <button onClick={syncAndRefresh} disabled={checking}
                      className="px-3 py-1.5 rounded-xl bg-pink-500 text-white text-sm font-semibold disabled:opacity-60">
                {checking ? "Checking…" : "Refresh"}
              </button>
              <button
                onClick={async () => {
                  await logoutSession();
                  setWallet(""); setAuthed(false); setHold(0); setUnlockedMap({});
                  try { localStorage.removeItem("crush_wallet"); } catch {}
                }}
                className="px-3 py-1.5 rounded-xl bg-black/30 border border-pink-300/30 text-pink-100 text-sm font-semibold"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      <main className="min-h-screen px-4 py-12 flex flex-col items-center">
        {/* HERO */}
        <h1 className="text-4xl font-bold text-white title-glow mb-3">Meet Xenia</h1>
        <p className="text-pink-100/90 text-center max-w-2xl">
          Your flirty AI girlfriend. Teasing chat now — and hotter experiences as you hold more <b>$CRUSH</b>.
        </p>

        {/* WALLET / STATUS ROW (secondary, under hero) */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!wallet ? (
            <button onClick={connectWallet} className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold">
              Connect Phantom
            </button>
          ) : (
            <>
              <div className="px-3 py-2 rounded-xl bg-black/30 border border-pink-300/30 text-sm text-white">
                Wallet: <span className="font-mono">{wallet.slice(0, 4)}…{wallet.slice(-4)}</span>
              </div>
              {!authed ? (
                <button onClick={secureLogin} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">
                  Secure Login
                </button>
              ) : (
                <span className="px-3 py-2 rounded-xl bg-emerald-600/30 border border-emerald-400/40 text-emerald-100 text-sm">
                  Session active
                </span>
              )}
              <button onClick={syncAndRefresh} disabled={checking}
                      className="px-3 py-2 rounded-xl bg-pink-500 text-white text-sm font-semibold disabled:opacity-60">
                {checking ? "Checking…" : "Refresh Balance"}
              </button>
              <button
                onClick={async () => {
                  if (!wallet) return;
                  const ids = await fetchEntitlements(wallet);
                  setUnlockedMap((m) => { const n = { ...m }; for (const id of ids) n[id] = true; return n; });
                  toast("🔁 Purchases restored");
                }}
                className="px-3 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 text-sm font-semibold"
              >
                Restore purchases
              </button>
              <button
                onClick={async () => {
                  await logoutSession();
                  setWallet(""); setAuthed(false); setHold(0); setUnlockedMap({});
                  try { localStorage.removeItem("crush_wallet"); } catch {}
                }}
                className="px-3 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 text-sm font-semibold"
              >
                Disconnect
              </button>
              <div className="text-pink-50 text-sm">Your $CRUSH: <b>{hold.toLocaleString()}</b></div>
            </>
          )}
          {TREASURY_WALLET && (
            <div className="px-3 py-2 rounded-xl bg-black/30 border border-pink-300/30 text-xs text-pink-200">
              Treasury: <span className="font-mono">{TREASURY_WALLET.slice(0,4)}…{TREASURY_WALLET.slice(-4)}</span>
            </div>
          )}
          {err && <div className="text-pink-200 text-sm">{err}</div>}
        </div>

        {/* TIERS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-6xl mt-8">
          <TierCard
            title="Flirty Chat"
            desc={`Hold ≥ ${CHAT_MIN_HOLD.toLocaleString()} $CRUSH`}
            features={["Playful, teasing conversation", "XP & levels", "Typing/streaming replies"]}
            status={chatUnlocked ? "unlocked" : "locked"}
            ctas={chatUnlocked
              ? <Link href="/#xenia-chat" className="px-4 py-2 rounded-xl bg-pink-600 text-white font-semibold hover:bg-pink-500">Start chatting</Link>
              : <Link href="/buy" className="px-4 py-2 rounded-xl bg-pink-500 text-white font-semibold hover:bg-pink-600">Get $CRUSH</Link>}
          />
          <TierCard
            title="NSFW Gallery"
            desc={`Hold ≥ ${NSFW_HOLD.toLocaleString()} $CRUSH · or buy per image`}
            features={["Exclusive NSFW sets", "Buy single images with $CRUSH", "Cross-device unlocks (Supabase)"]}
            status={hold >= NSFW_HOLD ? "unlocked" : "locked"}
            ctas={<div className="flex gap-2">
              <Link href="/gallery" className="px-4 py-2 rounded-xl bg-pink-600 text-white font-semibold hover:bg-pink-500">Browse Gallery</Link>
              {hold < NSFW_HOLD && <Link href="/buy" className="px-4 py-2 rounded-xl bg-pink-500 text-white font-semibold hover:bg-pink-600">Buy $CRUSH</Link>}
            </div>}
          />
          <TierCard
            title="Custom Scenes"
            desc="Coming soon"
            features={["Prompt Xenia to model custom scenes", "Higher tiers get priority", "Save & share sets"]}
            status="soon"
            ctas={<Link href="/whitepaper" className="px-4 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 font-semibold hover:bg-black/50">Read the plan</Link>}
          />
        </div>

        {/* CONTENT VAULT */}
        <section className="w-full max-w-6xl mt-10">
          <div className="flex items-end justify-between mb-3">
            <h3 className="text-xl font-bold text-white">Xenia’s Content Vault</h3>
            <div className="text-pink-100/90 text-sm">Your balance: <b>{hold.toLocaleString()}</b> $CRUSH</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {vaultWithNeed.map((it) => (
              <VaultCard
                key={it.id}
                item={it}
                hold={hold}
                wallet={wallet}
                nsfwUnlocked={hold >= NSFW_HOLD}
                unlockedMap={unlockedMap}
                onUnlocked={(idOrIds) => {
                  setUnlockedMap((m) => {
                    const next = { ...m };
                    (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).forEach((id) => { next[id] = true; });
                    return next;
                  });
                  toast("✨ Unlocked!");
                }}
                authed={authed}
                refCode={refCode}
              />
            ))}
          </div>
        </section>

        {/* PREVIEW DECOR */}
        <div className="w-full max-w-5xl mt-10 grid grid-cols-2 md:grid-cols-4 gap-4" aria-hidden="true">
          {["/sfw/s1.png", "/sfw/s2.png", "/nsfw/n1_blur.png", "/nsfw/n2_blur.png"].map((src, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-pink-300/30 bg-black/30">
              <img src={src} alt="" aria-hidden="true" loading="lazy" className={`w-full h-40 object-cover ${reducedMotion ? "" : "preview-pop"}`} />
            </div>
          ))}
        </div>

        {/* CTA ROW */}
        <div className="flex flex-wrap gap-3 mt-10">
          <Link href="/gallery" className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold">Explore Gallery</Link>
          <Link href="/" className="px-5 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-semibold">Go to Chat</Link>
          <Link href="/buy" className="px-5 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 font-semibold hover:bg-black/50">Get $CRUSH</Link>
        </div>

        <div className="mt-6">
          <ShareOnX
            text={mounted ? (hold >= CHAT_MIN_HOLD ? `I just unlocked flirty chat with Xenia on Crush AI 😘` : `I’m checking out Xenia on Crush AI 💘`) : "Crush AI — flirty chat on Solana 💘"}
            url={mounted ? window.location.origin + "/meet-xenia" : "https://yourdomain.com/meet-xenia"}
            hashtags={["Solana", "AI", "Crypto"]}
            via="CrushAIx"
          />
        </div>

        <img src="/cupid_female.png" alt="" aria-hidden="true" className="opacity-70 mt-10 w-36" />
        <noscript>
          <p className="text-pink-100 text-center mt-6">
            Enable JavaScript or <a href="/buy" className="underline text-pink-200">buy $CRUSH</a> to unlock.
          </p>
        </noscript>
      </main>

      {toastUI}

      <style jsx global>{`
        .title-glow { text-shadow: 0 0 12px #fa1a81bb, 0 0 32px #fff; }
        a:focus-visible, button:focus-visible { outline: 3px solid #b5fffc !important; outline-offset: 2px; border-radius: 12px; }
        .preview-pop { animation: pop-in 650ms cubic-bezier(0.22, 1, 0.36, 1); }
        @keyframes pop-in { 0% { transform: scale(0.96); opacity: 0.2; } 100% { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .preview-pop { animation: none !important; transition: none !important; } }
        /* locked blur for premium text */
        .locked-blur { filter: blur(3px); }
      `}</style>
    </>
  );
}

function TierCard({ title, desc, features = [], status = "locked", ctas = null }) {
  const badge = status === "unlocked" ? "bg-green-500 text-white" : status === "soon" ? "bg-yellow-500 text-black" : "bg-pink-500 text-white";
  const label = status === "unlocked" ? "Unlocked" : status === "soon" ? "Soon" : "Locked";
  return (
    <div className="rounded-2xl border border-pink-300/30 bg-black/30 p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl text-white font-semibold">{title}</h2>
        <span className={`px-2 py-1 rounded-full text-xs font-bold ${badge}`}>{label}</span>
      </div>
      <div className="text-pink-100/90 mb-3">{desc}</div>
      <ul className="list-disc pl-5 text-pink-100/90 space-y-1">{features.map((f, i) => <li key={i}>{f}</li>)}</ul>
      {ctas && <div className="mt-3">{ctas}</div>}
    </div>
  );
}

function VaultCard({ item, hold, wallet, nsfwUnlocked, unlockedMap, onUnlocked, authed, refCode }) {
  const unlocked = hold >= item.minHold;
  const needed = Math.max(0, item.minHold - hold);

  return (
    <div className="ns-card relative rounded-2xl border border-pink-300/30 bg-black/30 p-5 overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h4 className="text-lg font-semibold text-white">{item.title}</h4>
        {item.type === "pay-images" || item.type === "bundle" ? (
          <span className="px-2 py-1 rounded-full text-xs font-bold bg-pink-500 text-white">{item.type === "bundle" ? "Bundle" : "Pay per image"}</span>
        ) : unlocked ? (
          <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-500 text-white">Unlocked</span>
        ) : (
          <span className="px-2 py-1 rounded-full text-xs font-bold bg-pink-500 text-white">Needs {item.minHold.toLocaleString()}</span>
        )}
      </div>
      <div className="text-pink-100/90 mb-3">{item.blurb}</div>

      {/* TEXT CONTENT — premium blur when locked */}
      {item.type === "text" && (
        <div className={`relative rounded-xl border border-pink-300/25 ${unlocked ? "bg-white/5" : "bg-black/40"}`}>
          <div className={`p-4 ${unlocked ? "" : "locked-blur"}`}>
            <ul className="list-disc pl-6 space-y-1 text-pink-50">
              {(item.content || []).map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>
          {!unlocked && (
            <div className="absolute inset-0 flex items-end justify-between p-3 pointer-events-none">
              <span className="text-pink-100/90 text-xs bg-black/40 px-2 py-1 rounded-md border border-pink-300/25">
                Teaser — hold more $CRUSH to read
              </span>
              <span className="text-pink-200/80 text-xs">✨</span>
            </div>
          )}
        </div>
      )}

      {/* IMAGE SETS (hold-gated) */}
      {item.type === "images" && (
        <div className="grid grid-cols-3 gap-2">
          {(item.images || []).map((im, i) => (
            <figure key={i} className="rounded-lg overflow-hidden border border-pink-300/25 bg-white/5">
              <img src={im.src} alt={im.alt} loading="lazy" className={`w-full h-28 object-cover ${unlocked ? "" : "opacity-70 blur-sm"}`} />
              <figcaption className="px-2 py-1 text-xs text-pink-100/90">{unlocked ? im.alt : "Locked preview"}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {/* PAY-PER-IMAGE */}
      {item.type === "pay-images" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(item.images || []).map((im) => {
            const perImageFree = typeof im.freeIfHold === "number" ? (hold >= im.freeIfHold) : false;
            const fully = nsfwUnlocked || perImageFree || !!unlockedMap[im.id];
            const canOpen = fully && authed; // must be authed to fetch media
            return (
              <figure key={im.id} className="rounded-lg overflow-hidden border border-pink-300/25 bg-white/5">
                <img src={im.preview} alt={im.title} loading="lazy" className={`w-full h-40 object-cover ${fully ? "" : "opacity-70 blur-sm"}`} />
                <figcaption className="px-2 py-1 text-xs text-pink-100/90 flex items-center justify-between">
                  <span>{im.title}</span>
                  {!fully && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 border border-pink-300/30">
                      {typeof im.freeIfHold === "number" ? `Free ≥ ${im.freeIfHold.toLocaleString()}` : `Free ≥ ${NSFW_HOLD.toLocaleString()}`}
                    </span>
                  )}
                </figcaption>
                <div className="p-2 flex items-center justify-between gap-2">
                  {canOpen ? (
                    <a className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold w-full text-center"
                       href={`/api/media/${encodeURIComponent(im.id)}`} target="_blank" rel="noreferrer">View Full-Res</a>
                  ) : fully ? (
                    <span className="px-3 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 text-sm text-center w-full">
                      {authed ? "Unlocked" : "Secure Login required"}
                    </span>
                  ) : (
                    <PayUnlockButton
                      wallet={wallet}
                      itemId={im.id}
                      price={im.priceCrush}
                      onUnlocked={() => onUnlocked?.(im.id)}
                      refCode={refCode}
                    />
                  )}
                </div>
              </figure>
            );
          })}
        </div>
      )}

      {/* BUNDLE PURCHASE */}
      {item.type === "bundle" && (
        <div className="rounded-xl border border-pink-300/25 bg-white/5 p-3">
          <div className="text-pink-100/90 text-sm mb-2">
            Includes: {item.children.map((c, i) => <code key={c} className="mx-1 text-pink-200">{c}{i < item.children.length - 1 ? "," : ""}</code>)}
          </div>
          <PayUnlockButton
            wallet={wallet}
            itemId={item.id}
            price={item.priceCrush}
            onUnlocked={() => onUnlocked?.(item.children)}
            refCode={refCode}
          />
        </div>
      )}

      {/* BUY MORE $CRUSH ROW (for hold-gated items only) */}
      {item.type !== "pay-images" && item.type !== "bundle" && !unlocked && (
        <div className="mt-3 flex items-center justify-between">
          <div className="text-pink-200 text-sm">You need <b>{needed.toLocaleString()}</b> more $CRUSH to unlock.</div>
          <Link href="/buy" className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold">Get $CRUSH</Link>
        </div>
      )}
    </div>
  );
}

function PayUnlockButton({ wallet, itemId, price, onUnlocked, refCode }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function start() {
    if (!wallet) return setErr("Connect wallet first");
    setBusy(true); setErr("");
    try {
      const { url, reference } = await createPayment({ wallet, itemId, ref: refCode || undefined });
      window.open(url, "_blank", "noopener,noreferrer");
      const t0 = Date.now();
      while (Date.now() - t0 < 120000) {
        await new Promise((r) => setTimeout(r, 4000));
        const v = await verifyPayment({ wallet, itemId, reference });
        if (v?.ok) {
          onUnlocked?.();
          // Optional entitlement pull (extra safety; parent state already updates)
          try { await fetch(`/api/entitlements?wallet=${encodeURIComponent(wallet)}`).then((r)=>r.json()); } catch {}
          setBusy(false);
          return;
        }
      }
      setErr("Payment not detected yet. Try Restore later.");
    } catch (e) {
      setErr(e?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="share-group flex flex-col gap-1 w-full">
      <button onClick={start} disabled={busy} className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold disabled:opacity-60 w-full">
        {busy ? "Waiting…" : `Unlock for ${price} $CRUSH`}
      </button>
      {!busy && (
        <ShareOnX
          text={`I'm unlocking ${itemId} on Crush AI 🔥`}
          url={typeof window !== "undefined" ? window.location.href.split("?")[0] : "https://yourdomain.com/meet-xenia"}
          hashtags={["CrushAI", "Solana"]}
          via="CrushAIx"
        />
      )}
      {err && <span className="text-pink-200 text-xs">{err}</span>}
    </div>
  );
}
