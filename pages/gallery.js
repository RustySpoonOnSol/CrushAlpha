// pages/gallery.js — keep your working version, add wallet change handling
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

// Try to load real items; fallback to demo if lib/payments not present in Alpha
let REAL_ITEMS = null;
try { REAL_ITEMS = require("../lib/payments").ITEMS || null; } catch { REAL_ITEMS = null; }

const DEMO_ITEMS = [
  { id: "vip-gallery-01-1", title: "Tease #1", priceCrush: 250, preview: "/nsfw1_blurred.png" },
  { id: "vip-gallery-01-2", title: "Tease #2", priceCrush: 250, preview: "/nsfw2_blurred.png" },
];

const ITEMS = REAL_ITEMS && Array.isArray(REAL_ITEMS) && REAL_ITEMS.length ? REAL_ITEMS : DEMO_ITEMS;

/** ===== Env & RPC (client) ===== */
const MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";

const HELIUS_KEY = process.env.NEXT_PUBLIC_HELIUS_KEY || "";
const RPCS = [
  process.env.NEXT_PUBLIC_SOLANA_RPC || "",
  HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

const NSFW_HOLD = Number(process.env.NEXT_PUBLIC_NSFW_HOLD ?? "2000");

/** ===== helpers ===== */
async function fetchWithTimeout(url, init = {}, ms = 8000) {
  return Promise.race([
    fetch(url, init),
    new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), ms)),
  ]);
}
async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const headers = { "content-type": "application/json" };
  for (const url of RPCS) {
    try {
      const r = await fetchWithTimeout(url, { method: "POST", headers, body }, 8000);
      const j = await r.json();
      if (!j?.error) return j.result;
    } catch {}
  }
  throw new Error("All RPCs failed");
}
async function getCrushBalance(owner, mint) {
  const res = await rpc("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed" }]);
  let total = 0;
  for (const v of res?.value || []) {
    total += Number(v?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
  }
  return total;
}

/** ===== Pay + Verify APIs ===== */
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

/** ===== Entitlements API ===== */
async function fetchEntitlements(wallet) {
  const r = await fetch(`/api/entitlements?wallet=${encodeURIComponent(wallet)}`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.items || []).map((x) => x.itemId);
}

/** ===== Tiny Toast ===== */
function useToast() {
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState("info");
  function show(m, k = "info") {
    setKind(k); setMsg(m);
    setTimeout(() => setMsg(""), 3000);
  }
  const el = !msg ? null : (
    <div className={`fixed left-1/2 -translate-x-1/2 bottom-6 z-50 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg
       ${kind === "ok" ? "bg-green-600" : kind === "warn" ? "bg-yellow-600" : "bg-pink-600"}`}>
      {msg}
    </div>
  );
  return { show, ToastEl: el };
}

export default function Gallery() {
  const { show, ToastEl } = useToast();

  const [wallet, setWallet] = useState("");
  const [hold, setHold] = useState(0);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");
  const [unlocked, setUnlocked] = useState({});
  const nsfwUnlocked = hold >= NSFW_HOLD;

  // UI
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [onlyUnlocked, setOnlyUnlocked] = useState(false);
  const [processing, setProcessing] = useState({});

  const markUnlocked = (ids) => {
    if (!ids?.length) return;
    setUnlocked((m) => { const next = { ...m }; for (const id of ids) next[id] = true; return next; });
  };

  // central wallet switcher (reset → hydrate)
  const setActiveWallet = async (pk) => {
    setWallet(pk);
    setHold(0);
    setUnlocked({});
    try { localStorage.setItem("crush_wallet", pk); } catch {}
    await refreshHold(pk);
    try { markUnlocked(await fetchEntitlements(pk)); } catch {}
  };

  // init + listen to Phantom accountChanged
  useEffect(() => {
    const stored = localStorage.getItem("crush_wallet") || "";
    if (window?.solana?.isPhantom) {
      const onAcct = (pubkey) => {
        const next = pubkey?.toString?.() || pubkey || "";
        if (!next) {
          setWallet(""); setHold(0); setUnlocked({});
          try { localStorage.removeItem("crush_wallet"); } catch {}
        } else if (next !== wallet) {
          setActiveWallet(next);
        }
      };
      try { window.solana.on?.("accountChanged", onAcct); } catch {}

      // try auto-connect
      window.solana.connect({ onlyIfTrusted: true }).then((r) => {
        const pk = r?.publicKey?.toString();
        if (pk) setActiveWallet(pk);
        else if (stored) setActiveWallet(stored);
      }).catch(() => { if (stored) setActiveWallet(stored); });

      return () => { try { window.solana.removeListener?.("accountChanged", onAcct); } catch {} };
    }

    if (stored) setActiveWallet(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectWallet() {
    try {
      setErr("");
      if (!window?.solana?.isPhantom) { setErr("Phantom not found. Install Phantom to continue."); return; }
      const r = await window.solana.connect({ onlyIfTrusted: false });
      const pk = r?.publicKey?.toString();
      if (!pk) throw new Error("No public key");
      await setActiveWallet(pk);
      show("Wallet connected", "ok");
    } catch (e) {
      setErr(e?.message || "Failed to connect wallet");
    }
  }

  async function refreshHold(pk = wallet) {
    if (!pk) return;
    setChecking(true); setErr("");
    try { setHold(await getCrushBalance(pk, MINT)); }
    catch { setErr("Balance check failed. Try again."); }
    finally { setChecking(false); }
  }

  // also re-sync to Phantom current account
  async function syncAndRefresh() {
    try {
      if (window?.solana?.isPhantom) {
        const r = await window.solana.connect({ onlyIfTrusted: true });
        const pk = r?.publicKey?.toString();
        if (pk && pk !== wallet) { await setActiveWallet(pk); return; }
      }
    } catch {}
    await refreshHold(wallet);
  }

  async function restorePurchases() { if (!wallet) return; try { markUnlocked(await fetchEntitlements(wallet)); show("Purchases restored", "ok"); } catch { show("Couldn’t restore right now", "warn"); } }

  async function startPay(itemId) {
    if (!wallet) { show("Connect wallet first"); return; }
    const item = ITEMS.find((x) => x.id === itemId);
    if (!item) return;
    setProcessing((p) => ({ ...p, [itemId]: true }));
    try {
      const { url, reference } = await createPayment({ wallet, itemId });
      window.open(url, "_blank", "noopener,noreferrer");
      show("Waiting for confirmation…");

      const begun = Date.now();
      while (Date.now() - begun < 120000) {
        await new Promise((r) => setTimeout(r, 4000));
        const v = await verifyPayment({ wallet, itemId, reference });
        if (v?.ok) {
          setUnlocked((m) => ({ ...m, [itemId]: true }));
          show("Unlocked!", "ok");
          setProcessing((p) => { const n = { ...p }; delete n[itemId]; return n; });
          return;
        }
      }
      show("Not detected yet — try Restore purchases", "warn");
    } catch (e) {
      show(e?.message || "Payment failed");
    } finally {
      setProcessing((p) => { const n = { ...p }; delete n[itemId]; return n; });
    }
  }

  const filtered = useMemo(() => {
    let arr = [...ITEMS];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter((it) => it.title.toLowerCase().includes(q));
    }
    if (onlyUnlocked) arr = arr.filter((it) => nsfwUnlocked || unlocked[it.id]);
    switch (sort) {
      case "price-asc":  arr.sort((a,b)=> (a.priceCrush||0) - (b.priceCrush||0)); break;
      case "price-desc": arr.sort((a,b)=> (b.priceCrush||0) - (a.priceCrush||0)); break;
      case "title":      arr.sort((a,b)=> a.title.localeCompare(b.title)); break;
      default: break;
    }
    return arr;
  }, [query, sort, onlyUnlocked, unlocked, nsfwUnlocked]);

  return (
    <div className="min-h-screen px-4 py-10">
      <Head>
        <title>Xenia Gallery — Crush AI</title>
        <meta name="description" content="Unlock individual VIP photos with $CRUSH or by holding enough to access all." />
        <meta property="og:title" content="Xenia Gallery — Crush AI" />
        <meta property="og:description" content="Pay-per-image unlocks. Hold more $CRUSH to access all." />
        <meta property="og:image" content="/og-gallery.png" />
      </Head>

      {/* Header */}
      <header className="max-w-6xl mx-auto mb-6">
        <h1 className="text-3xl font-bold text-white">Xenia Gallery</h1>
        <p className="text-pink-100/90">Pay-per-image unlocks. Hold ≥ {NSFW_HOLD.toLocaleString()} $CRUSH to view all.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!wallet ? (
            <button onClick={connectWallet} className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold">
              Connect Phantom
            </button>
          ) : (
            <>
              <div className="px-3 py-2 rounded-xl bg-black/30 border border-pink-300/30 text-sm text-white">
                Wallet: <span className="font-mono">{wallet.slice(0,4)}…{wallet.slice(-4)}</span>
              </div>
              <button onClick={syncAndRefresh} disabled={checking}
                className="px-3 py-2 rounded-xl bg-pink-500 text-white text-sm font-semibold disabled:opacity-60">
                {checking ? "Checking…" : "Refresh Balance"}
              </button>
              <button onClick={restorePurchases}
                className="px-3 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 text-sm font-semibold">
                Restore purchases
              </button>
              <button
                onClick={() => { setWallet(""); setHold(0); setUnlocked({}); try { localStorage.removeItem("crush_wallet"); } catch {} }}
                className="px-3 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 text-sm font-semibold"
              >
                Disconnect
              </button>
              <div className="text-pink-50 text-sm">Your $CRUSH: <b>{hold.toLocaleString()}</b></div>
            </>
          )}
          {err && <div className="text-pink-200 text-sm">{err}</div>}
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <input
            className="px-3 py-2 rounded-xl bg-black/30 border border-pink-300/30 text-pink-50 placeholder-pink-200/70"
            placeholder="Search…"
            value={query}
            onChange={(e)=>setQuery(e.target.value)}
          />
          <select
            className="px-3 py-2 rounded-xl bg-black/30 border border-pink-300/30 text-pink-50"
            value={sort} onChange={(e)=>setSort(e.target.value)}
          >
            <option value="newest">Newest</option>
            <option value="price-asc">Price ↑</option>
            <option value="price-desc">Price ↓</option>
            <option value="title">Title A–Z</option>
          </select>
          <label className="flex items-center gap-2 text-pink-100/90">
            <input type="checkbox" checked={onlyUnlocked} onChange={(e)=>setOnlyUnlocked(e.target.checked)} />
            Show unlocked only
          </label>
        </div>
      </header>

      {/* Grid */}
      <main className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-pink-100/80">
            Nothing here yet. Try clearing filters or <Link href="/buy" className="underline">get $CRUSH</Link>.
          </div>
        )}

        {filtered.map((it) => {
          const isUnlocked = nsfwUnlocked || !!unlocked[it.id];
          const isBusy = !!processing[it.id];
          return (
            <article key={it.id} className="rounded-2xl overflow-hidden border border-pink-300/30 bg-black/30 shadow-lg">
              <div className="relative aspect-[4/5] overflow-hidden">
                <img
                  src={it.preview}
                  alt={it.title}
                  className={`w-full h-full object-cover ${isUnlocked ? "" : "opacity-80 blur-[2px]"}`}
                  loading="lazy"
                />
                {/* Badge */}
                <div className="absolute top-3 left-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold
                    ${isBusy ? "bg-yellow-500 text-black" :
                      isUnlocked ? "bg-green-500 text-white" : "bg-pink-600 text-white"}`}>
                    {isBusy ? "Processing" : isUnlocked ? "Unlocked" : "Locked"}
                  </span>
                </div>
              </div>

              <div className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-white font-semibold">{it.title}</div>
                  <div className="text-pink-100/80 text-sm">
                    {isUnlocked ? "Full access" : `Unlock for ${it.priceCrush} $CRUSH`}
                  </div>
                </div>

                {isUnlocked ? (
                  <a
                    className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold"
                    href={`/api/media/${encodeURIComponent(it.id)}?wallet=${encodeURIComponent(wallet)}`}
                    target="_blank" rel="noreferrer"
                  >
                    View Full-Res
                  </a>
                ) : wallet ? (
                  <button
                    onClick={() => startPay(it.id)}
                    disabled={isBusy}
                    className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold disabled:opacity-60"
                  >
                    {isBusy ? "Waiting…" : `Unlock (${it.priceCrush})`}
                  </button>
                ) : (
                  <Link href="/buy" className="px-3 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold">
                    Buy $CRUSH
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </main>

      {ToastEl}

      <style jsx>{`
        input, select { outline: none; }
        a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible {
          outline: 3px solid #b5fffc; outline-offset: 2px; border-radius: 12px;
        }
      `}</style>
    </div>
  );
}
