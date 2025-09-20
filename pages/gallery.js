// pages/gallery.js
import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";

/** ===== ENV / thresholds ===== */
const CHAT_MIN_HOLD = Number(process.env.NEXT_PUBLIC_MIN_HOLD ?? "500");
const NSFW_HOLD = Number(process.env.NEXT_PUBLIC_NSFW_HOLD ?? "2000");
const MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";

/** ===== RPC rotation with fallback ===== */
const HELIUS_KEY = process.env.NEXT_PUBLIC_HELIUS_KEY || "";
const RPCS_RAW = [
  process.env.NEXT_PUBLIC_SOLANA_RPC || "",
  HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);
const RPCS = RPCS_RAW.length ? RPCS_RAW : ["https://api.mainnet-beta.solana.com"];

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
  for (const v of res?.value || []) total += Number(v?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
  return total;
}

/** ===== Auth + Entitlements ===== */
async function getChallenge(wallet) {
  const r = await fetch(`/api/auth/challenge?wallet=${encodeURIComponent(wallet)}`);
  if (!r.ok) throw new Error("Challenge failed");
  return r.json();
}
async function postVerify(body) {
  const r = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Verify failed");
  return r.json();
}
async function getMe() { const r = await fetch("/api/auth/me"); if (!r.ok) return { authed: false }; return r.json(); }
async function fetchEntitlements(wallet) {
  const r = await fetch(`/api/entitlements?wallet=${encodeURIComponent(wallet)}`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.items || []).map((x) => x.itemId);
}
async function logoutSession() { try { await fetch("/api/auth/logout"); } catch {} }
function bytesToBase64(bytes) { let bin = ""; const arr = Array.from(bytes); for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]); return btoa(bin); }
function base64ToUint8Array(b64) { const bin = atob(b64); const len = bin.length; const out = new Uint8Array(len); for (let i=0;i<len;i++) out[i]=bin.charCodeAt(i); return out; }

/** ===== Entitlement upsert (client fallback) ===== */
async function grantEntitlement(wallet, itemId, signature) {
  try {
    await fetch("/api/entitlements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet, itemId, signature })
    });
  } catch {}
}

/** ===== Pay/Verify API helpers ===== */
async function createPayment({ wallet, itemId, ref }) {
  const r = await fetch("/api/pay/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, itemId, ref, treasury: true }),
  });
  if (!r.ok) throw new Error("Create payment failed");
  return r.json();
}
async function buildTx({ wallet, itemId, reference }) {
  const r = await fetch("/api/pay/tx", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, itemId, reference }),
  });
  if (!r.ok) throw new Error("Build tx failed");
  return r.json(); // { ok, txBase64, ... }
}
async function verifyPayment({ wallet, itemId, reference }) {
  const qs = new URLSearchParams({ wallet, itemId, reference });
  const r = await fetch(`/api/pay/verify?${qs.toString()}`);
  if (!r.ok) return { ok: false };
  return r.json();
}

/** ===== Gallery items ===== */
const GALLERIES = [
  { id: "vip-gallery-01", title: "VIP Gallery · 01", images: [
    { id: "vip-gallery-01-1", title: "VIP Photo 01", priceCrush: 250, preview: "/xenia/nsfw/nsfw-01-blur.png", freeIfHold: 2000 },
    { id: "vip-gallery-01-2", title: "VIP Photo 02", priceCrush: 300, preview: "/xenia/nsfw/nsfw-02-blur.png", freeIfHold: 3000 },
    { id: "vip-gallery-01-3", title: "VIP Photo 03", priceCrush: 400, preview: "/xenia/nsfw/nsfw-03-blur.png", freeIfHold: 5000 },
  ]},
  { id: "pp-gallery-02", title: "Purchase-Only Gallery · 02", images: [
    { id: "pp-02-1", title: "Photo A", priceCrush: 500, preview: "/xenia/pp/pp-01-blur.png" },
    { id: "pp-02-2", title: "Photo B", priceCrush: 750, preview: "/xenia/pp/pp-02-blur.png", freeIfHold: 3500 },
    { id: "pp-02-3", title: "Photo C", priceCrush: 1000, preview: "/xenia/pp/pp-03-blur.png" },
  ]},
];

export default function GalleryPage() {
  const [mounted, setMounted] = useState(false);
  const [wallet, setWallet] = useState("");
  const [authed, setAuthed] = useState(false);
  const [hold, setHold] = useState(0);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");
  const [unlockedMap, setUnlockedMap] = useState({});
  const [refCode, setRefCode] = useState("");

  useEffect(() => {
    setMounted(true);
    try {
      const u = new URL(window.location.href);
      const ref = u.searchParams.get("ref");
      const saved = localStorage.getItem("crush_ref") || "";
      if (ref && ref !== saved) localStorage.setItem("crush_ref", ref);
      setRefCode(ref || saved || "");
    } catch {}
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const stored = localStorage.getItem("crush_wallet") || "";
    async function activate(pk) {
      setWallet(pk); setAuthed(false); setHold(0); setUnlockedMap({});
      try { localStorage.setItem("crush_wallet", pk); } catch {}
      await refreshHold(pk);
      try {
        const ids = await fetchEntitlements(pk);
        setUnlockedMap((m) => { const n = { ...m }; for (const id of ids) n[id] = true; return n; });
      } catch {}
      try { const me = await getMe(); setAuthed(me.authed && me.wallet === pk); } catch {}
    }
    if (window?.solana?.isPhantom) {
      const onAcct = async (pubkey) => {
        const next = pubkey?.toString?.() || pubkey || "";
        await logoutSession();
        if (!next) {
          setWallet(""); setAuthed(false); setHold(0); setUnlockedMap({});
          try { localStorage.removeItem("crush_wallet"); } catch {}
        } else if (next !== wallet) {
          await activate(next);
        }
      };
      try { window.solana.on?.("accountChanged", onAcct); } catch {}
      window.solana.connect({ onlyIfTrusted: true })
        .then((r)=>r?.publicKey?.toString())
        .then((pk)=> pk ? activate(pk) : (stored ? activate(stored) : null))
        .catch(async ()=> { if (stored) await activate(stored); });
      return () => { try { window.solana.removeListener?.("accountChanged", onAcct); } catch {} };
    }
    if (stored) activate(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  async function connectWallet() {
    try {
      if (!window?.solana?.isPhantom) return setErr("Phantom not found.");
      const r = await window.solana.connect({ onlyIfTrusted: false });
      const pk = r?.publicKey?.toString();
      if (!pk) throw new Error("No public key");
      setErr("");
      setWallet(pk);
      localStorage.setItem("crush_wallet", pk);
      await refreshHold(pk);
      const ids = await fetchEntitlements(pk);
      setUnlockedMap((m) => { const n = { ...m }; for (const id of ids) n[id] = true; return n; });
      const me = await getMe(); setAuthed(me.authed && me.wallet === pk);
    } catch (e) { setErr(e?.message || "Connect failed"); }
  }
  async function secureLogin() {
    try {
      if (!wallet) return setErr("Connect wallet first");
      if (!window.solana?.signMessage) return setErr("Wallet lacks signMessage");
      const ch = await getChallenge(wallet);
      const msgBytes = new TextEncoder().encode(ch.message);
      const sig = await window.solana.signMessage(msgBytes, "utf8");
      const signatureBase64 = bytesToBase64(new Uint8Array(sig.signature));
      const v = await postVerify({ wallet, signatureBase64, nonce: ch.nonce, ts: ch.ts });
      if (v?.ok) setAuthed(true);
    } catch (e) { setErr(e?.message || "Login failed"); }
  }

  async function refreshHold(pk = wallet) {
    if (!pk) return;
    setChecking(true); setErr("");
    try {
      const bal = await getCrushBalance(pk, MINT);
      setHold(bal);
    } catch { setErr("Balance check failed."); }
    finally { setChecking(false); }
  }

  const nsfwUnlocked = hold >= NSFW_HOLD;

  return (
    <>
      <Head>
        <title>Gallery | Crush AI</title>
        <meta name="robots" content="noimageindex, noai" />
      </Head>

      <div className="sticky top-0 z-40 backdrop-blur-md bg[rgba(20,9,25,0.35)] bg-[rgba(20,9,25,0.35)] border-b border-pink-300/20">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2">
          <Link href="/meet-xenia" className="text-pink-100 hover:underline">← Back</Link>
          <div className="ml-auto flex items-center gap-2">
            {!wallet ? (
              <button onClick={connectWallet} className="px-3 py-1.5 rounded-xl bg-pink-600 text-white text-sm font-semibold hover:bg-pink-500">Connect Phantom</button>
            ) : (
              <>
                {!authed ? (
                  <button onClick={secureLogin} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold">Secure Login</button>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-600/30 border border-emerald-400/40 text-emerald-100 text-xs">Session active</span>
                )}
                <button onClick={() => refreshHold()} disabled={checking} className="px-3 py-1.5 rounded-xl bg-pink-500 text-white text-sm font-semibold disabled:opacity-60">
                  {checking ? "Checking…" : `Balance: ${hold.toLocaleString()}`}
                </button>
                <button
                  onClick={async () => {
                    if (!wallet) return;
                    const ids = await fetchEntitlements(wallet);
                    setUnlockedMap((m) => { const n = { ...m }; for (const id of ids) n[id] = true; return n; });
                  }}
                  className="px-3 py-1.5 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 text-sm font-semibold"
                >
                  Restore purchases
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {GALLERIES.map((g) => (
          <section key={g.id} className="mb-10">
            <h2 className="text-white font-semibold text-2xl mb-3">{g.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {g.images.map((im) => {
                const perImageFree = typeof im.freeIfHold === "number" ? (hold >= im.freeIfHold) : false;
                const fully = nsfwUnlocked || perImageFree || !!unlockedMap[im.id];
                const canOpen = fully && authed;
                return (
                  <figure key={im.id} className="rounded-2xl overflow-hidden border border-pink-300/30 bg-black/30">
                    <div className="relative">
                      <img
                        src={im.preview}
                        alt={im.title}
                        loading="lazy"
                        className={`w-full h-[360px] object-cover select-none ${fully ? "" : "locked-preview"}`}
                        draggable={false}
                        onContextMenu={(e)=>e.preventDefault()}
                      />
                      {!fully && (
                        <>
                          <span className="absolute top-3 left-3 text-xs font-bold px-2 py-1 rounded-full bg-pink-500 text-white">Locked</span>
                          <span className="watermark absolute inset-0 pointer-events-none" aria-hidden="true">CRUSH • LOCKED</span>
                        </>
                      )}
                    </div>
                    <figcaption className="p-4 bg-gradient-to-t from-pink-900/20 to-transparent">
                      <div className="text-white font-semibold">{im.title}</div>
                      <div className="text-pink-100/90 text-sm mt-1">
                        {fully ? "Unlocked" : `Unlock for ${im.priceCrush.toLocaleString()} $CRUSH`}
                        {im.freeIfHold && !fully && (
                          <span className="ml-2 text-xs bg-black/40 border border-pink-300/30 px-2 py-0.5 rounded-full">
                            Free ≥ {im.freeIfHold.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="mt-3">
                        {canOpen ? (
                          <a className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold inline-block"
                             href={`/api/media/${encodeURIComponent(im.id)}`} target="_blank" rel="noreferrer">
                            View Full-Res
                          </a>
                        ) : fully ? (
                          <span className="px-4 py-2 rounded-xl bg-black/40 border border-pink-300/40 text-pink-100 font-semibold inline-block">
                            {authed ? "Unlocked" : "Secure Login required"}
                          </span>
                        ) : (
                          <PayUnlockButton
                            wallet={wallet}
                            itemId={im.id}
                            price={im.priceCrush}
                            onUnlocked={async () => {
                              setUnlockedMap((m) => ({ ...m, [im.id]: true }));
                              try { await fetch(`/api/entitlements?wallet=${encodeURIComponent(wallet)}`).then((r)=>r.json()); } catch {}
                            }}
                            refCode={refCode}
                          />
                        )}
                      </div>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      <style jsx global>{`
        .locked-preview { filter: blur(18px) saturate(0.7) brightness(0.7) contrast(0.9); transform: scale(1.02); }
        .watermark { display: block; background-image: repeating-linear-gradient(-35deg, rgba(255,255,255,0.12) 0 40px, transparent 40px 80px); mix-blend-mode: overlay; }
        img { -webkit-user-drag: none; user-select: none; }
      `}</style>
    </>
  );
}

/** ===== Pay button (programmatic Phantom ➜ fallback link ➜ SSE + verify + grant) ===== */
function PayUnlockButton({ wallet, itemId, price, onUnlocked, refCode }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    if (!wallet) return setErr("Connect wallet first");
    setBusy(true); setErr("");

    try {
      // 1) Create → returns reference & links
      const created = await createPayment({ wallet, itemId, ref: refCode || undefined });
      if (!created?.ok) throw new Error(created?.error || "Create failed");
      const { url: solanaUrl, universalUrl, reference } = created;

      // 2) SSE subscription for real-time unlock
      let done = false;
      let es;
      try {
        es = new EventSource(`/api/pay/subscribe?ref=${encodeURIComponent(reference)}`);
        es.onmessage = async (ev) => {
          try {
            const j = JSON.parse(ev.data || "{}");
            if (j.ok && !done) {
              done = true;
              es.close?.();
              // persist entitlement (client-side fallback)
              await grantEntitlement(wallet, itemId, j.signature);
              onUnlocked?.();
            }
          } catch {}
        };
        es.onerror = () => {};
      } catch {}

      // 3) Prefer programmatic wallet approval (desktop + Phantom dapp browser)
      let programmaticWorked = false;
      if (window?.solana?.signAndSendTransaction) {
        try {
          const txResp = await buildTx({ wallet, itemId, reference });
          if (!txResp?.ok || !txResp?.txBase64) throw new Error(txResp?.error || "Build tx failed");

          const { Transaction } = await import("@solana/web3.js");
          const tx = Transaction.from(base64ToUint8Array(txResp.txBase64));

          try { await window.solana.connect({ onlyIfTrusted: true }); } catch {}
          const { signature } = await window.solana.signAndSendTransaction(tx);
          console.log("Submitted:", signature);

          programmaticWorked = true;

          // Kick verify to publish immediately
          fetch(`/api/pay/verify?wallet=${encodeURIComponent(wallet)}&itemId=${encodeURIComponent(itemId)}&reference=${encodeURIComponent(reference)}`)
            .then(r=>r.json()).then(v => console.log("verify:", v));
        } catch (e) {
          console.warn("Programmatic pay failed; falling back to link:", e);
        }
      }

      // 4) Fallback: open Phantom universal/solana link
      if (!programmaticWorked) {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const open = (href) => window.open(href, "_blank", "noopener,noreferrer");
        if (isMobile) open(universalUrl || solanaUrl); else open(universalUrl || solanaUrl);

        // Short verify loop if webhook/SSE is delayed
        setTimeout(async () => {
          if (done) return;
          for (let i = 0; i < 10 && !done; i++) {
            const v = await verifyPayment({ wallet, itemId, reference }).catch(() => null);
            if (v?.ok) {
              done = true;
              es?.close?.();
              await grantEntitlement(wallet, itemId, v.signature);
              onUnlocked?.();
              break;
            }
            await new Promise((r) => setTimeout(r, 3000));
          }
          if (!done) setErr("Payment pending. Try Restore later.");
          setBusy(false);
        }, 6000);
      } else {
        // If programmatic path used, quick verify loop just in case
        const until = Date.now() + 45_000;
        while (!done && Date.now() < until) {
          const v = await verifyPayment({ wallet, itemId, reference }).catch(() => null);
          if (v?.ok) {
            done = true;
            es?.close?.();
            await grantEntitlement(wallet, itemId, v.signature);
            onUnlocked?.();
            break;
          }
          await new Promise((r) => setTimeout(r, 3000));
        }
        if (!done) setErr("Payment submitted, awaiting finality… Use Restore later if needed.");
        setBusy(false);
      }
    } catch (e) {
      setErr(e?.message || "Payment failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button onClick={start} disabled={busy} className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold disabled:opacity-60">
        {busy ? "Waiting…" : `Unlock (${price.toLocaleString()})`}
      </button>
      {err && <span className="text-pink-200 text-xs">{err}</span>}
    </div>
  );
}
