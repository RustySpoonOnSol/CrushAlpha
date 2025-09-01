// pages/meet-xenia.js
import Head from "next/head";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import ShareOnX from "../components/ShareOnX";

/** ===== Config ===== */
const MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";

const HELIUS_KEY = process.env.NEXT_PUBLIC_HELIUS_KEY || "";
const RPCS = [
  process.env.NEXT_PUBLIC_SOLANA_RPC || "",
  HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

// Global thresholds (align with site + env)
const CHAT_MIN_HOLD = Number(process.env.NEXT_PUBLIC_MIN_HOLD ?? "500");
const NSFW_HOLD = Number(process.env.NEXT_PUBLIC_NSFW_HOLD ?? "2000");
const GODDESS_HOLD = Number(process.env.NEXT_PUBLIC_GODDESS_HOLD ?? "5000");

/** ===== Content Catalog (unchanged) ===== */
const VAULT = [
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
  {
    id: "sfw-tease-set",
    type: "images",
    title: "SFW Tease Set · 01",
    blurb: "Playful poses — perfect for your lockscreen.",
    minHold: CHAT_MIN_HOLD,
    images: [
      { src: "/xenia/sfw/tease-01.jpg", alt: "Xenia — playful pose" },
      { src: "/xenia/sfw/tease-02.jpg", alt: "Xenia — wink" },
      { src: "/xenia/sfw/tease-03.jpg", alt: "Xenia — neon glow" },
    ],
  },
  /** VIP: pay per image or free if user holds ≥ NSFW_HOLD */
  {
    id: "vip-gallery-01",
    type: "pay-images",
    title: "VIP Gallery Drop · 01",
    blurb: "Exclusive set. Pay per-image to unlock, or hold enough $CRUSH for full access.",
    minHold: 0,
    images: [
      { id: "vip-gallery-01-1", title: "VIP Photo 01", priceCrush: 250, preview: "/xenia/nsfw/nsfw-01-blur.jpg" },
      { id: "vip-gallery-01-2", title: "VIP Photo 02", priceCrush: 250, preview: "/xenia/nsfw/nsfw-02-blur.jpg" },
      { id: "vip-gallery-01-3", title: "VIP Photo 03", priceCrush: 250, preview: "/xenia/nsfw/nsfw-03-blur.jpg" },
    ],
  },
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
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("All RPCs failed");
}
async function getCrushBalance(owner, mint) {
  const res = await rpc("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed" }]);
  let total = 0;
  for (const v of res?.value || []) {
    total += Number(v?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
  }
  return total;
}

/** ===== Pay-per-image helpers ===== */
async function createPayment({ wallet, itemId }) {
  const r = await fetch("/api/pay/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, itemId }),
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

export default function MeetXenia() {
  const [mounted, setMounted] = useState(false);

  // wallet & holding state
  const [wallet, setWallet] = useState("");
  const [hold, setHold] = useState(0);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");

  // per-image unlocked flags for this session (after successful payment or restore)
  const [unlockedMap, setUnlockedMap] = useState({}); // { [itemId]: true }

  // UX
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setReducedMotion(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    } catch {}
  }, []);

  // Helper: set active wallet safely (reset then hydrate)
  const setActiveWallet = async (pk) => {
    setWallet(pk);
    setHold(0);
    setUnlockedMap({});
    try { localStorage.setItem("crush_wallet", pk); } catch {}
    await refreshHold(pk);
    try {
      const ids = await fetchEntitlements(pk);
      setUnlockedMap((m) => {
        const next = { ...m };
        for (const id of ids) next[id] = true;
        return next;
      });
    } catch {}
  };

  // restore wallet; also subscribe to Phantom account changes
  useEffect(() => {
    if (!mounted) return;

    const stored = localStorage.getItem("crush_wallet") || "";

    // Phantom listeners
    if (window?.solana?.isPhantom) {
      const onAcct = (pubkey) => {
        const next = pubkey?.toString?.() || pubkey || "";
        if (!next) {
          // disconnected
          setWallet(""); setHold(0); setUnlockedMap({});
          try { localStorage.removeItem("crush_wallet"); } catch {}
        } else if (next !== wallet) {
          setActiveWallet(next);
        }
      };
      try { window.solana.on?.("accountChanged", onAcct); } catch {}
      // try auto-connect
      window.solana
        .connect({ onlyIfTrusted: true })
        .then((r) => {
          const pk = r?.publicKey?.toString();
          if (pk) setActiveWallet(pk);
          else if (stored) setActiveWallet(stored);
        })
        .catch(() => { if (stored) setActiveWallet(stored); });

      return () => { try { window.solana.removeListener?.("accountChanged", onAcct); } catch {} };
    }

    if (stored) setActiveWallet(stored);
  }, [mounted, wallet]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function refreshHold(pk = wallet) {
    if (!pk) return;
    setChecking(true);
    setErr("");
    try {
      const bal = await getCrushBalance(pk, MINT);
      setHold(bal);
    } catch (e) {
      setErr("Balance check failed. Try again.");
    } finally {
      setChecking(false);
    }
  }

  // Refresh button also re-syncs to Phantom's current account if changed silently
  async function syncAndRefresh() {
    try {
      if (window?.solana?.isPhantom) {
        const r = await window.solana.connect({ onlyIfTrusted: true });
        const pk = r?.publicKey?.toString();
        if (pk && pk !== wallet) {
          await setActiveWallet(pk);
          return;
        }
      }
    } catch {}
    await refreshHold(wallet);
  }

  const chatUnlocked = hold >= CHAT_MIN_HOLD;
  const nsfwUnlocked = hold >= NSFW_HOLD;

  const vaultWithNeed = useMemo(
    () => VAULT.map((it) => ({ ...it, needed: Math.max(0, it.minHold - hold) })), [hold]
  );

  return (
    <>
      <Head>
        <title>Meet Xenia | Crush AI</title>
        <meta name="description" content="Xenia is your flirty AI girlfriend. Unlock hotter tiers with $CRUSH." />
        <link rel="canonical" href="https://yourdomain.com/meet-xenia" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Meet Xenia — your flirty AI" />
        <meta property="og:description" content="Hold $CRUSH to unlock chat, NSFW gallery and custom scenes." />
        <meta property="og:image" content="https://yourdomain.com/og-xenia.png" />
        <meta property="og:url" content="https://yourdomain.com/meet-xenia" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Meet Xenia — your flirty AI" />
        <meta name="twitter:description" content="Hold $CRUSH to unlock chat, NSFW gallery and custom scenes." />
        <meta name="twitter:image" content="https://yourdomain.com/og-xenia.png" />
        <meta name="theme-color" content="#fa1a81" />
      </Head>

      <main className="min-h-screen px-4 py-12 flex flex-col items-center">
        {/* HERO */}
        <h1 className="text-4xl font-bold text-white title-glow mb-3">Meet Xenia</h1>
        <p className="text-pink-100/90 text-center max-w-2xl">
          Your flirty AI girlfriend. Teasing chat now — and hotter experiences as you hold more <b>$CRUSH</b>.
        </p>

        {/* WALLET / STATUS ROW */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!wallet ? (
            <button
              onClick={connectWallet}
              className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold"
            >
              Connect Phantom
            </button>
          ) : (
            <>
              <div className="px-3 py-2 rounded-xl bg-black/30 border border-pink-300/30 text-sm text-white">
                Wallet: <span className="font-mono">{wallet.slice(0, 4)}…{wallet.slice(-4)}</span>
              </div>
              <button
                onClick={syncAndRefresh}
                disabled={checking}
                className="px-3 py-2 rounded-xl bg-pink-500 text-white text-sm font-semibold disabled:opacity-60"
              >
                {checking ? "Checking…" : "Refresh Balance"}
              </button>
              <button
                onClick={async () => {
                  if (!wallet) return;
                  const ids = await fetchEntitlements(wallet);
                  setUnlockedMap((m) => {
                    const next = { ...m };
                    for (const id of ids) next[id] = true;
                    return next;
                  });
                }}
                className="px-3 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 text-sm font-semibold"
              >
                Restore purchases
              </button>
              <button
                onClick={() => { setWallet(""); setHold(0); setUnlockedMap({}); try { localStorage.removeItem("crush_wallet"); } catch {} }}
                className="px-3 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 text-sm font-semibold"
              >
                Disconnect
              </button>
              <div className="text-pink-50 text-sm">
                Your $CRUSH: <b>{hold.toLocaleString()}</b>
              </div>
            </>
          )}
          {err && <div className="text-pink-200 text-sm">{err}</div>}
        </div>

        {/* TIERS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-6xl mt-8">
          <TierCard
            title="Flirty Chat"
            desc={`Hold ≥ ${CHAT_MIN_HOLD.toLocaleString()} $CRUSH`}
            features={["Playful, teasing conversation", "XP & levels for every spicy message", "Typing/streaming replies"]}
            status={chatUnlocked ? "unlocked" : "locked"}
            ctas={
              chatUnlocked ? (
                <Link href="/#xenia-chat" className="px-4 py-2 rounded-xl bg-pink-600 text-white font-semibold hover:bg-pink-500">
                  Start chatting
                </Link>
              ) : (
                <Link href="/buy" className="px-4 py-2 rounded-xl bg-pink-500 text-white font-semibold hover:bg-pink-600">
                  Get $CRUSH
                </Link>
              )
            }
          />
          <TierCard
            title="NSFW Gallery"
            desc={`Hold ≥ ${NSFW_HOLD.toLocaleString()} $CRUSH  · or buy per image`}
            features={["Exclusive NSFW sets", "Buy single images with $CRUSH", "Cross-device unlocks (Supabase)"]}
            status={nsfwUnlocked ? "unlocked" : "locked"}
            ctas={
              <div className="flex gap-2">
                <Link href="/gallery" className="px-4 py-2 rounded-xl bg-pink-600 text-white font-semibold hover:bg-pink-500">
                  Browse Gallery
                </Link>
                {!nsfwUnlocked && (
                  <Link href="/buy" className="px-4 py-2 rounded-xl bg-pink-500 text-white font-semibold hover:bg-pink-600">
                    Buy $CRUSH
                  </Link>
                )}
              </div>
            }
          />
          <TierCard
            title="Custom Scenes"
            desc="Coming soon"
            features={["Prompt Xenia to model custom scenes", "Higher tiers get priority", "Save & share sets"]}
            status="soon"
            ctas={
              <Link href="/whitepaper" className="px-4 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 font-semibold hover:bg-black/50">
                Read the plan
              </Link>
            }
          />
        </div>

        {/* CONTENT VAULT */}
        <section className="w-full max-w-6xl mt-10">
          <div className="flex items-end justify-between mb-3">
            <h3 className="text-xl font-bold text-white">Xenia’s Content Vault</h3>
            <div className="text-pink-100/90 text-sm">
              Your balance: <b>{hold.toLocaleString()}</b> $CRUSH
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {vaultWithNeed.map((it) => (
              <VaultCard
                key={it.id}
                item={it}
                hold={hold}
                wallet={wallet}
                nsfwUnlocked={nsfwUnlocked}
                unlockedMap={unlockedMap}
                onUnlocked={(id) => setUnlockedMap((m) => ({ ...m, [id]: true }))}
              />
            ))}
          </div>
        </section>

        {/* PREVIEW (decor) */}
        <div className="w-full max-w-5xl mt-10 grid grid-cols-2 md:grid-cols-4 gap-4" aria-hidden="true">
          {["/sfw/s1.jpg", "/sfw/s2.jpg", "/nsfw/n1_blur.jpg", "/nsfw/n2_blur.jpg"].map((src, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-pink-300/30 bg-black/30">
              <img src={src} alt="" aria-hidden="true" className={`w-full h-40 object-cover ${reducedMotion ? "" : "preview-pop"}`} />
            </div>
          ))}
        </div>

        {/* CTA ROW */}
        <div className="flex flex-wrap gap-3 mt-10">
          <Link href="/gallery" className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold">Explore Gallery</Link>
          <Link href="/" className="px-5 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-semibold">Go to Chat</Link>
          <Link href="/buy" className="px-5 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 font-semibold hover:bg-black/50">Get $CRUSH</Link>
        </div>

        {/* Share on X */}
        <div className="mt-6">
          <ShareOnX
            text={
              mounted
                ? hold >= CHAT_MIN_HOLD
                  ? `I just unlocked flirty chat with Xenia on Crush AI 😘`
                  : `I’m checking out Xenia on Crush AI 💘`
                : "Crush AI — flirty chat on Solana 💘"
            }
            url={mounted ? window.location.origin + "/meet-xenia" : "https://yourdomain.com/meet-xenia"}
            hashtags={["Solana", "AI", "Crypto"]}
            via="CrushAIx"
          />
        </div>

        {/* Decorative */}
        <img src="/cupid_female.png" alt="" aria-hidden="true" className="opacity-70 mt-10 w-36" />

        {/* No-JS fallback */}
        <noscript>
          <p className="text-pink-100 text-center mt-6">
            Enable JavaScript or <a href="/buy" className="underline text-pink-200">buy $CRUSH</a> to unlock.
          </p>
        </noscript>
      </main>

      <style jsx global>{`
        .title-glow { text-shadow: 0 0 12px #fa1a81bb, 0 0 32px #fff; }
        a:focus-visible, button:focus-visible, [role="button"]:focus-visible {
          outline: 3px solid #b5fffc !important; outline-offset: 2px; border-radius: 12px;
        }
        .preview-pop { animation: pop-in 650ms cubic-bezier(0.22, 1, 0.36, 1); }
        @keyframes pop-in { 0% { transform: scale(0.96); opacity: 0.2; } 100% { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .preview-pop { animation: none !important; transition: none !important; } }
      `}</style>
    </>
  );
}

/** ===== Presentational components (unchanged) ===== */
function TierCard({ title, desc, features = [], status = "locked", ctas = null }) {
  const badge =
    status === "unlocked" ? "bg-green-500 text-white" :
    status === "soon" ? "bg-yellow-500 text-black" :
    "bg-pink-500 text-white";
  const label = status === "unlocked" ? "Unlocked" : status === "soon" ? "Soon" : "Locked";

  return (
    <div className="rounded-2xl border border-pink-300/30 bg-black/30 p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl text-white font-semibold">{title}</h2>
        <span className={`px-2 py-1 rounded-full text-xs font-bold ${badge}`}>{label}</span>
      </div>
      <div className="text-pink-100/90 mb-3">{desc}</div>
      <ul className="list-disc pl-5 text-pink-100/90 space-y-1">
        {features.map((f, i) => <li key={i}>{f}</li>)}
      </ul>
      {ctas && <div className="mt-3">{ctas}</div>}
    </div>
  );
}

function VaultCard({ item, hold, wallet, nsfwUnlocked, unlockedMap, onUnlocked }) {
  const unlocked = hold >= item.minHold;
  const needed = Math.max(0, item.minHold - hold);

  return (
    <div className="relative rounded-2xl border border-pink-300/30 bg-black/30 p-5 overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h4 className="text-lg font-semibold text-white">{item.title}</h4>
        <NeededPill unlocked={unlocked} needed={needed} minHold={item.minHold} />
      </div>
      <div className="text-pink-100/90 mb-3">{item.blurb}</div>

      {item.type === "text" && (
        <div className={`rounded-xl border border-pink-300/25 ${unlocked ? "bg-white/5" : "bg-black/40"}`}>
          <ul className="p-4 list-disc pl-6 space-y-1 text-pink-50">
            {(item.content || []).map((line, i) => (
              <li key={i}>{unlocked ? line : blurText(line)}</li>
            ))}
          </ul>
        </div>
      )}

      {item.type === "images" && (
        <div className="grid grid-cols-3 gap-2">
          {(item.images || []).map((im, i) => (
            <figure key={i} className="rounded-lg overflow-hidden border border-pink-300/25 bg-white/5">
              <img
                src={im.src}
                alt={im.alt}
                className={`w-full h-28 object-cover ${unlocked ? "" : "opacity-70 blur-sm"}`}
                loading="lazy"
              />
              <figcaption className="px-2 py-1 text-xs text-pink-100/90">{unlocked ? im.alt : "Locked preview"}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {item.type === "pay-images" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(item.images || []).map((im) => {
            const isFullyUnlocked = nsfwUnlocked || !!unlockedMap[im.id];
            return (
              <figure key={im.id} className="rounded-lg overflow-hidden border border-pink-300/25 bg-white/5">
                <img
                  src={im.preview}
                  alt={im.title}
                  className={`w-full h-40 object-cover ${isFullyUnlocked ? "" : "opacity-70 blur-sm"}`}
                  loading="lazy"
                />
                <figcaption className="px-2 py-1 text-xs text-pink-100/90">
                  {im.title}
                </figcaption>

                <div className="p-2 flex items-center justify-between gap-2">
                  {isFullyUnlocked ? (
                    <a
                      className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold w-full text-center"
                      href={`/api/media/${encodeURIComponent(im.id)}?wallet=${encodeURIComponent(wallet)}`}
                      target="_blank" rel="noreferrer"
                    >
                      View Full-Res
                    </a>
                  ) : (
                    <PayUnlockButton
                      wallet={wallet}
                      itemId={im.id}
                      price={im.priceCrush}
                      onUnlocked={() => onUnlocked?.(im.id)}
                    />
                  )}
                </div>
              </figure>
            );
          })}
        </div>
      )}

      {item.type === "cta" && (
        <div className="mt-2">
          {unlocked ? (
            <Link href={item.ctaHref} className="px-4 py-2 inline-block rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold">
              {item.ctaLabel || "Open →"}
            </Link>
          ) : (
            <div className="text-pink-100/90">Unlock to access customs and early drops.</div>
          )}
        </div>
      )}

      {item.type !== "pay-images" && !unlocked && (
        <div className="mt-3 flex items-center justify-between">
          <div className="text-pink-200 text-sm">
            You need <b>{needed.toLocaleString()}</b> more $CRUSH to unlock.
          </div>
          <Link href="/buy" className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold">Get $CRUSH</Link>
        </div>
      )}
    </div>
  );
}

function PayUnlockButton({ wallet, itemId, price, onUnlocked }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    if (!wallet) return setErr("Connect wallet first");
    setBusy(true); setErr("");
    try {
      const { url, reference } = await createPayment({ wallet, itemId });
      window.open(url, "_blank", "noopener,noreferrer");
      const startTs = Date.now();
      while (Date.now() - startTs < 120000) {
        await new Promise((r) => setTimeout(r, 4000));
        const v = await verifyPayment({ wallet, itemId, reference });
        if (v?.ok) { onUnlocked?.(); setBusy(false); return; }
      }
      setErr("Payment not detected yet. Try again or hit Restore purchases later.");
    } catch (e) {
      setErr(e?.message || "Failed to start payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      <button
        onClick={start}
        disabled={busy}
        className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold disabled:opacity-60 w-full"
      >
        {busy ? "Waiting…" : `Unlock for ${price} $CRUSH`}
      </button>
      {err && <span className="text-pink-200 text-xs">{err}</span>}
    </div>
  );
}

function NeededPill({ unlocked, needed, minHold }) {
  return unlocked ? (
    <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-500 text-white">Unlocked</span>
  ) : (
    <span className="px-2 py-1 rounded-full text-xs font-bold bg-pink-500 text-white">
      Needs {minHold.toLocaleString()}
    </span>
  );
}

function blurText(s) {
  return s.replace(/[A-Za-z0-9]/g, (c, i) => (i % 3 === 0 ? c : "•"));
}
