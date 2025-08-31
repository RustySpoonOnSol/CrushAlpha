// pages/gallery.js
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ITEMS } from "@/lib/payments";

/** ===== Env & RPC config (client-side) ===== */
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

/** ===== Tiny helpers ===== */
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
  for (const url of RPCS) {
    try {
      const r = await fetchWithTimeout(url, { method: "POST", headers, body }, 8000);
      const j = await r.json();
      if (j?.error) throw new Error(j.error?.message || "rpc error");
      return j.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all RPCs failed");
}
async function getCrushBalance(owner, mint) {
  const res = await rpc("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed" }]);
  let total = 0;
  for (const v of res?.value || []) {
    total += Number(v?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
  }
  return total;
}

/** ===== Pay intent + verify (uses your API) ===== */
async function createPayment({ wallet, itemId }) {
  const r = await fetch("/api/pay/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, itemId }),
  });
  if (!r.ok) throw new Error("Create payment failed");
  return r.json(); // { url, reference }
}
async function verifyPayment({ wallet, itemId, reference }) {
  const qs = new URLSearchParams({ wallet, itemId, reference });
  const r = await fetch(`/api/pay/verify?${qs.toString()}`);
  if (!r.ok) return { ok: false };
  return r.json(); // { ok, signature? }
}

/** ===== Entitlements (persistent) ===== */
async function fetchEntitlements(wallet) {
  const r = await fetch(`/api/entitlements?wallet=${encodeURIComponent(wallet)}`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.items || []).map((x) => x.itemId);
}

/** ===== Page ===== */
export default function Gallery() {
  const [wallet, setWallet] = useState("");
  const [hold, setHold] = useState(0);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");

  // Which images are unlocked for this wallet (persisted via Supabase, loaded on connect)
  const [unlocked, setUnlocked] = useState({}); // { [itemId]: true }

  const nsfwUnlocked = hold >= NSFW_HOLD;

  useEffect(() => {
    // try restore trusted Phantom + entitlements
    const stored = localStorage.getItem("crush_wallet") || "";
    if (stored) {
      setWallet(stored);
      refreshHold(stored);
      fetchEntitlements(stored).then(markUnlocked).catch(() => {});
    } else if (window?.solana?.isPhantom) {
      window.solana
        .connect({ onlyIfTrusted: true })
        .then((r) => {
          const pk = r?.publicKey?.toString();
          if (pk) {
            setWallet(pk);
            try { localStorage.setItem("crush_wallet", pk); } catch {}
            refreshHold(pk);
            fetchEntitlements(pk).then(markUnlocked).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, []);

  function markUnlocked(ids) {
    setUnlocked((m) => {
      const next = { ...m };
      for (const id of ids) next[id] = true;
      return next;
    });
  }

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
      try { localStorage.setItem("crush_wallet", pk); } catch {}
      await refreshHold(pk);
      const ids = await fetchEntitlements(pk);
      markUnlocked(ids);
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
    } catch {
      setErr("Balance check failed. Try again.");
    } finally {
      setChecking(false);
    }
  }

  async function restorePurchases() {
    if (!wallet) return;
    try {
      const ids = await fetchEntitlements(wallet);
      markUnlocked(ids);
    } catch {}
  }

  const grid = useMemo(() => ITEMS || [], []);

  return (
    <div className="min-h-screen px-4 py-10">
      <Head>
        <title>Xenia Gallery — Crush AI</title>
        <meta name="description" content="Unlock individual VIP photos with $CRUSH or by holding enough to access all." />
      </Head>

      <header className="max-w-6xl mx-auto mb-6">
        <h1 className="text-3xl font-bold text-white">Xenia Gallery</h1>
        <p className="text-pink-100/90">Pay-per-image unlocks. Hold ≥ {NSFW_HOLD.toLocaleString()} $CRUSH to view all.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
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
                Wallet: <span className="font-mono">{wallet.slice(0,4)}…{wallet.slice(-4)}</span>
              </div>
              <button
                onClick={() => refreshHold()}
                disabled={checking}
                className="px-3 py-2 rounded-xl bg-pink-500 text-white text-sm font-semibold disabled:opacity-60"
              >
                {checking ? "Checking…" : "Refresh Balance"}
              </button>
              <button
                onClick={restorePurchases}
                className="px-3 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 text-sm font-semibold"
              >
                Restore purchases
              </button>
              <div className="text-pink-50 text-sm">
                Your $CRUSH: <b>{hold.toLocaleString()}</b>
              </div>
            </>
          )}
          {err && <div className="text-pink-200 text-sm">{err}</div>}
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {grid.map((it) => {
          const isUnlocked = nsfwUnlocked || !!unlocked[it.id];
          return (
            <article key={it.id} className="rounded-2xl overflow-hidden border border-pink-300/30 bg-black/30">
              <div className="aspect-[4/5] overflow-hidden">
                <img
                  src={it.preview}
                  alt={it.title}
                  className={`w-full h-full object-cover ${isUnlocked ? "" : "opacity-80 blur-[2px]"}`}
                  loading="lazy"
                />
              </div>
              <div className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-white font-semibold">{it.title}</div>
                  <div className="text-pink-100/80 text-sm">
                    {isUnlocked ? "Unlocked" : `Unlock for ${it.priceCrush} $CRUSH`}
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
                  <PayButton
                    wallet={wallet}
                    itemId={it.id}
                    price={it.priceCrush}
                    onUnlocked={() => setUnlocked((m) => ({ ...m, [it.id]: true }))}
                  />
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

      <footer className="max-w-6xl mx-auto mt-10 flex items-center justify-between text-pink-100/80">
        <Link href="/" className="underline">Back to Chat</Link>
        <Link href="/buy" className="underline">Get $CRUSH</Link>
      </footer>
    </div>
  );
}

/** ===== Pay button component ===== */
function PayButton({ wallet, itemId, price, onUnlocked }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    try {
      setBusy(true); setErr("");
      const { url, reference } = await createPayment({ wallet, itemId });
      window.open(url, "_blank", "noopener,noreferrer");
      const start = Date.now();
      while (Date.now() - start < 120000) {
        await new Promise((r) => setTimeout(r, 4000));
        const v = await verifyPayment({ wallet, itemId, reference });
        if (v?.ok) {
          onUnlocked?.();
          setBusy(false);
          return;
        }
      }
      setErr("Payment not detected yet. Try Restore purchases.");
    } catch (e) {
      setErr(e?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={start}
        disabled={busy}
        className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold disabled:opacity-60"
      >
        {busy ? "Waiting…" : `Unlock (${price} $CRUSH)`}
      </button>
      {err && <span className="text-pink-200 text-xs mt-1">{err}</span>}
    </div>
  );
}
