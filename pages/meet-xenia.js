// pages/meet-xenia.js
import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
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

// thresholds (align with your site)
const CHAT_MIN_HOLD = Number(process.env.NEXT_PUBLIC_MIN_HOLD ?? "500");
const NSFW_HOLD = Number(process.env.NEXT_PUBLIC_NSFW_HOLD ?? "2000");

/** ===== tiny RPC helper (with timeout + fallbacks) ===== */
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
      const r = await fetchWithTimeout(
        endpoint,
        { method: "POST", headers, body },
        8000
      );
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
  const res = await rpc("getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed" },
  ]);
  let total = 0;
  for (const v of res?.value || []) {
    total += Number(
      v?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0
    );
  }
  return total;
}

export default function MeetXenia() {
  const [mounted, setMounted] = useState(false);

  // wallet & holding state
  const [wallet, setWallet] = useState("");
  const [hold, setHold] = useState(0);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");

  // UX bits
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setReducedMotion(
        window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
      );
    } catch {}
  }, []);

  // restore wallet quickly if trusted
  useEffect(() => {
    if (!mounted) return;
    const stored = localStorage.getItem("crush_wallet") || "";
    if (stored) {
      setWallet(stored);
      refreshHold(stored);
    } else if (window?.solana?.isPhantom) {
      window.solana
        .connect({ onlyIfTrusted: true })
        .then((r) => {
          const pk = r?.publicKey?.toString();
          if (pk) {
            setWallet(pk);
            try {
              localStorage.setItem("crush_wallet", pk);
            } catch {}
            refreshHold(pk);
          }
        })
        .catch(() => {});
    }
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
      setWallet(pk);
      try {
        localStorage.setItem("crush_wallet", pk);
      } catch {}
      await refreshHold(pk);
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

  const chatUnlocked = hold >= CHAT_MIN_HOLD;
  const nsfwUnlocked = hold >= NSFW_HOLD;

  return (
    <>
      <Head>
        <title>Meet Xenia | Crush AI</title>
        <meta
          name="description"
          content="Xenia is your flirty AI girlfriend. Unlock hotter tiers with $CRUSH."
        />
        <link rel="canonical" href="https://yourdomain.com/meet-xenia" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Meet Xenia — your flirty AI" />
        <meta
          property="og:description"
          content="Hold $CRUSH to unlock chat, NSFW gallery and custom scenes."
        />
        <meta property="og:image" content="https://yourdomain.com/og-xenia.png" />
        <meta property="og:url" content="https://yourdomain.com/meet-xenia" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Meet Xenia — your flirty AI" />
        <meta
          name="twitter:description"
          content="Hold $CRUSH to unlock chat, NSFW gallery and custom scenes."
        />
        <meta name="twitter:image" content="https://yourdomain.com/og-xenia.png" />
        <meta name="theme-color" content="#fa1a81" />
      </Head>

      <main className="min-h-screen px-4 py-12 flex flex-col items-center">
        {/* HERO */}
        <h1 className="text-4xl font-bold text-white title-glow mb-3">Meet Xenia</h1>
        <p className="text-pink-100/90 text-center max-w-2xl">
          Your flirty AI girlfriend. Teasing chat now — and hotter experiences
          as you hold more <b>$CRUSH</b>.
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
                onClick={() => refreshHold()}
                disabled={checking}
                className="px-3 py-2 rounded-xl bg-pink-500 text-white text-sm font-semibold disabled:opacity-60"
              >
                {checking ? "Checking…" : "Refresh Balance"}
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
          {/* Tier 1: Chat */}
          <TierCard
            title="Flirty Chat"
            desc={`Hold ≥ ${CHAT_MIN_HOLD.toLocaleString()} $CRUSH`}
            features={[
              "Playful, teasing conversation",
              "XP & levels for every spicy message",
              "Typing/streaming replies",
            ]}
            status={chatUnlocked ? "unlocked" : "locked"}
            ctas={
              chatUnlocked ? (
                <Link
                  href="/#xenia-chat"
                  className="px-4 py-2 rounded-xl bg-pink-600 text-white font-semibold hover:bg-pink-500"
                >
                  Start chatting
                </Link>
              ) : (
                <Link
                  href="/buy"
                  className="px-4 py-2 rounded-xl bg-pink-500 text-white font-semibold hover:bg-pink-600"
                >
                  Get $CRUSH
                </Link>
              )
            }
          />

          {/* Tier 2: NSFW Gallery */}
          <TierCard
            title="NSFW Gallery"
            desc={`Hold ≥ ${NSFW_HOLD.toLocaleString()} $CRUSH  · or buy per image`}
            features={[
              "Exclusive NSFW sets",
              "Buy single images with $CRUSH",
              "Cross-device unlocks (Supabase)",
            ]}
            status={nsfwUnlocked ? "unlocked" : "locked"}
            ctas={
              <div className="flex gap-2">
                <Link
                  href="/gallery"
                  className="px-4 py-2 rounded-xl bg-pink-600 text-white font-semibold hover:bg-pink-500"
                >
                  Browse Gallery
                </Link>
                {!nsfwUnlocked && (
                  <Link
                    href="/buy"
                    className="px-4 py-2 rounded-xl bg-pink-500 text-white font-semibold hover:bg-pink-600"
                  >
                    Buy $CRUSH
                  </Link>
                )}
              </div>
            }
          />

          {/* Tier 3: Custom Scenes (teaser) */}
          <TierCard
            title="Custom Scenes"
            desc="Coming soon"
            features={[
              "Prompt Xenia to model custom scenes",
              "Higher tiers get priority",
              "Save & share sets",
            ]}
            status="soon"
            ctas={
              <Link
                href="/whitepaper"
                className="px-4 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 font-semibold hover:bg-black/50"
              >
                Read the plan
              </Link>
            }
          />
        </div>

        {/* PREVIEW (decorative, reduced motion friendly) */}
        <div className="w-full max-w-5xl mt-10 grid grid-cols-2 md:grid-cols-4 gap-4" aria-hidden="true">
          {["/sfw/s1.jpg", "/sfw/s2.jpg", "/nsfw/n1_blur.jpg", "/nsfw/n2_blur.jpg"].map(
            (src, i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden border border-pink-300/30 bg-black/30"
              >
                <img
                  src={src}
                  alt=""
                  aria-hidden="true"
                  className={`w-full h-40 object-cover ${reducedMotion ? "" : "preview-pop"}`}
                />
              </div>
            )
          )}
        </div>

        {/* CTA ROW */}
        <div className="flex flex-wrap gap-3 mt-10">
          <Link
            href="/gallery"
            className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold"
          >
            Explore Gallery
          </Link>
          <Link
            href="/"
            className="px-5 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-semibold"
          >
            Go to Chat
          </Link>
          <Link
            href="/buy"
            className="px-5 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 font-semibold hover:bg-black/50"
          >
            Get $CRUSH
          </Link>
        </div>

        {/* Share on X */}
        <div className="mt-6">
          <ShareOnX
            text={
              mounted
                ? chatUnlocked
                  ? `I just unlocked flirty chat with Xenia on Crush AI 😘`
                  : `I’m checking out Xenia on Crush AI 💘`
                : "Crush AI — flirty chat on Solana 💘"
            }
            url={mounted ? window.location.origin + "/meet-xenia" : "https://yourdomain.com/meet-xenia"}
            hashtags={["Solana", "AI", "Crypto"]}
            via="CrushAIx"
          />
        </div>

        {/* Decorative (screen reader skip) */}
        <img
          src="/cupid_female.png"
          alt=""
          aria-hidden="true"
          className="opacity-70 mt-10 w-36"
        />

        {/* No-JS fallback */}
        <noscript>
          <p className="text-pink-100 text-center mt-6">
            Enable JavaScript or{" "}
            <a href="/buy" className="underline text-pink-200">
              buy $CRUSH
            </a>{" "}
            to unlock.
          </p>
        </noscript>
      </main>

      {/* Styles */}
      <style jsx global>{`
        .title-glow {
          text-shadow: 0 0 12px #fa1a81bb, 0 0 32px #fff;
        }
        a:focus-visible,
        button:focus-visible,
        [role="button"]:focus-visible {
          outline: 3px solid #b5fffc !important;
          outline-offset: 2px;
          border-radius: 12px;
        }
        .preview-pop {
          animation: pop-in 650ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes pop-in {
          0% {
            transform: scale(0.96);
            opacity: 0.2;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .preview-pop {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </>
  );
}

/** ===== Small presentational card ===== */
function TierCard({ title, desc, features = [], status = "locked", ctas = null }) {
  const badge =
    status === "unlocked"
      ? "bg-green-500 text-white"
      : status === "soon"
      ? "bg-yellow-500 text-black"
      : "bg-pink-500 text-white";
  const label =
    status === "unlocked" ? "Unlocked" : status === "soon" ? "Soon" : "Locked";

  return (
    <div className="rounded-2xl border border-pink-300/30 bg-black/30 p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl text-white font-semibold">{title}</h2>
        <span className={`px-2 py-1 rounded-full text-xs font-bold ${badge}`}>
          {label}
        </span>
      </div>
      <div className="text-pink-100/90 mb-3">{desc}</div>
      <ul className="list-disc pl-5 text-pink-100/90 space-y-1">
        {features.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
      {ctas && <div className="mt-3">{ctas}</div>}
    </div>
  );
}
