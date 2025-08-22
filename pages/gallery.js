// pages/gallery.js
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../utils/supabaseClient";

const MINT = process.env.NEXT_PUBLIC_CRUSH_MINT || "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";
const TREASURY = process.env.NEXT_PUBLIC_TREASURY || ""; // <-- REQUIRED: your receiving wallet
const NSFW_HOLD = Number(process.env.NEXT_PUBLIC_NSFW_HOLD ?? "2000");

// Optional multi-RPC (left simple; add your Helius if you want)
const RPCS = [
  process.env.NEXT_PUBLIC_SOLANA_RPC || "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

function cx(...a){ return a.filter(Boolean).join(" "); }

// ---- Demo content (replace image paths with your real files in /public) ----
const SFW_IMAGES = [
  { id: "sfw-1", src: "/sfw/s1.jpg", title: "Stargaze" },
  { id: "sfw-2", src: "/sfw/s2.jpg", title: "Cherry Kiss" },
  { id: "sfw-3", src: "/sfw/s3.jpg", title: "Neon Dreams" },
  { id: "sfw-4", src: "/sfw/s4.jpg", title: "Velvet Night" },
];

const NSFW_IMAGES = [
  { id: "nsfw-1", src: "/nsfw/n1_blur.jpg", full: "/nsfw/n1.jpg", title: "Silk", priceCrush: 100 },
  { id: "nsfw-2", src: "/nsfw/n2_blur.jpg", full: "/nsfw/n2.jpg", title: "Scarlet", priceCrush: 120 },
  { id: "nsfw-3", src: "/nsfw/n3_blur.jpg", full: "/nsfw/n3.jpg", title: "Whisper", priceCrush: 150 },
  { id: "nsfw-4", src: "/nsfw/n4_blur.jpg", full: "/nsfw/n4.jpg", title: "Afterglow", priceCrush: 200 },
];

// ---------------- RPC helpers (balance & mint decimals) ----------------
async function rpcCall(method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  let last;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
      const j = await r.json();
      if (j.error) throw new Error(j.error?.message || "RPC error");
      return j.result;
    } catch (e) { last = e; }
  }
  throw last || new Error("All RPCs failed");
}

async function getCrushBalance(owner, mint) {
  const res = await rpcCall("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed" }]);
  let total = 0;
  for (const v of (res?.value || [])) {
    total += Number(v?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
  }
  return total;
}

async function getMintDecimals(mint) {
  // getAccountInfo on mint address; parse decimals from data via SPL helper at runtime if available
  try {
    const { Connection, clusterApiUrl, PublicKey } = await import("@solana/web3.js");
    const endpoint = RPCS[0] || clusterApiUrl("mainnet-beta");
    const conn = new Connection(endpoint, "confirmed");
    const pk = new PublicKey(mint);
    const acc = await conn.getAccountInfo(pk);
    if (!acc) throw new Error("Mint not found");
    // SPL Mint layout: decimals at offset 44 (u8). We'll lazy import spl to parse safely.
    try {
      const spl = await import("@solana/spl-token");
      const mintInfo = await spl.getMint(conn, pk);
      return mintInfo.decimals ?? 9;
    } catch {
      // quick fallback (most SPLs use 9)
      return 9;
    }
  } catch { return 9; }
}

// ---------------- Local purchase cache ----------------
function getLocalPurchases(wallet) {
  try {
    return new Set(JSON.parse(localStorage.getItem(`crush_purchases_${wallet}`) || "[]"));
  } catch { return new Set(); }
}
function setLocalPurchases(wallet, set) {
  try { localStorage.setItem(`crush_purchases_${wallet}`, JSON.stringify([...set])); } catch {}
}

// ---------------- Supabase purchases -----------------
async function loadPurchasesSupabase(wallet) {
  if (!wallet || !supabase) return [];
  try {
    const { data, error } = await supabase.from("purchases").select("image_id").eq("wallet", wallet);
    if (error) return [];
    return (data || []).map(r => r.image_id);
  } catch { return []; }
}
async function savePurchaseSupabase({ wallet, image_id, price_crush, txsig }) {
  if (!wallet || !supabase) return;
  try {
    await supabase.from("purchases").insert({ wallet, image_id, price_crush, txsig });
  } catch {}
}

/*
-- Supabase migration (run once)
create table if not exists purchases (
  id bigint generated always as identity primary key,
  wallet text not null,
  image_id text not null,
  price_crush numeric not null,
  txsig text,
  created_at timestamptz default now(),
  unique(wallet, image_id)
);
create index on purchases (wallet);
*/

// ---------------- UI ----------------
export default function Gallery() {
  const [tab, setTab] = useState("SFW"); // "SFW" | "NSFW"
  const [mounted, setMounted] = useState(false);

  // wallet + hold
  const [wallet, setWallet] = useState("");
  const [hold, setHold] = useState(0);
  const [checking, setChecking] = useState(false);
  const isHolderForNSFW = hold >= NSFW_HOLD;

  // purchases
  const [owned, setOwned] = useState(new Set());
  const [busy, setBusy] = useState(""); // image id being purchased
  const [err, setErr] = useState("");

  useEffect(() => setMounted(true), []);

  // restore wallet
  useEffect(() => {
    if (!mounted) return;
    const w = localStorage.getItem("crush_wallet") || "";
    if (w) { setWallet(w); setOwned(getLocalPurchases(w)); refreshHold(w); pullSupabase(w); }
    else if (window?.solana?.isPhantom) {
      window.solana.connect({ onlyIfTrusted: true }).then((r) => {
        const pk = r?.publicKey?.toString();
        if (pk) {
          setWallet(pk);
          try { localStorage.setItem("crush_wallet", pk); } catch {}
          setOwned(getLocalPurchases(pk));
          refreshHold(pk); pullSupabase(pk);
        }
      }).catch(()=>{});
    }
  }, [mounted]);

  async function connectWallet() {
    try {
      if (!window?.solana?.isPhantom) { setErr("Phantom not found."); return; }
      const r = await window.solana.connect({ onlyIfTrusted: false });
      const pk = r?.publicKey?.toString();
      if (pk) {
        setWallet(pk);
        try { localStorage.setItem("crush_wallet", pk); } catch {}
        setOwned(getLocalPurchases(pk));
        refreshHold(pk); pullSupabase(pk);
      }
    } catch (e) {
      setErr(e?.message || "Connect failed");
    }
  }

  async function refreshHold(pk = wallet) {
    if (!pk) return;
    setChecking(true); setErr("");
    try { setHold(await getCrushBalance(pk, MINT)); }
    catch { setErr("Balance check failed"); }
    finally { setChecking(false); }
  }

  async function pullSupabase(pk = wallet) {
    const arr = await loadPurchasesSupabase(pk);
    if (arr.length) {
      setOwned(prev => {
        const next = new Set(prev);
        arr.forEach(id => next.add(id));
        setLocalPurchases(pk, next);
        return next;
      });
    }
  }

  async function buyImage(image) {
    if (!TREASURY) { setErr("Treasury wallet is not configured."); return; }
    if (!wallet) { await connectWallet(); if (!wallet) return; }
    setErr(""); setBusy(image.id);
    try {
      // dyn import web3 + spl
      const web3 = await import("@solana/web3.js");
      const spl = await import("@solana/spl-token");

      // connection + pubkeys
      const endpoint = RPCS[0] || web3.clusterApiUrl("mainnet-beta");
      const connection = new web3.Connection(endpoint, "confirmed");
      const userPK = new web3.PublicKey(wallet);
      const mintPK = new web3.PublicKey(MINT);
      const destPK = new web3.PublicKey(TREASURY);

      // mint decimals & amount
      const decimals = await getMintDecimals(MINT);
      const amount = BigInt(Math.trunc(image.priceCrush * 10 ** decimals)); // e.g. 100 CRUSH
      if (amount <= 0n) throw new Error("Invalid amount");

      // derive ATAs
      const userATA = await spl.getAssociatedTokenAddress(mintPK, userPK, false, spl.TOKEN_PROGRAM_ID, spl.ASSOCIATED_TOKEN_PROGRAM_ID);
      const destATA = await spl.getAssociatedTokenAddress(mintPK, destPK, false, spl.TOKEN_PROGRAM_ID, spl.ASSOCIATED_TOKEN_PROGRAM_ID);

      // ensure dest ATA exists (we don't auto-create to avoid charging user rent)
      const destInfo = await connection.getAccountInfo(destATA);
      if (!destInfo) {
        throw new Error("Destination token account not found. Ask admin to create treasury ATA for $CRUSH.");
      }

      // build tx: transfer tokens
      const tx = new web3.Transaction();
      tx.add(
        spl.createTransferInstruction(
          userATA,
          destATA,
          userPK,
          amount,
          [],
          spl.TOKEN_PROGRAM_ID
        )
      );
      tx.feePayer = userPK;
      tx.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;

      // sign + send with Phantom
      const signed = await window.solana.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      await connection.confirmTransaction(sig, "confirmed");

      // persist purchase (supabase + local)
      await savePurchaseSupabase({ wallet, image_id: image.id, price_crush: image.priceCrush, txsig: sig });
      setOwned(prev => {
        const next = new Set(prev); next.add(image.id);
        setLocalPurchases(wallet, next);
        return next;
      });
    } catch (e) {
      setErr(e?.message || "Purchase failed");
    } finally {
      setBusy("");
    }
  }

  const nsfwUnlockedGlobally = isHolderForNSFW;
  const canBuy = !!wallet && !nsfwUnlockedGlobally;

  return (
    <>
      <Head>
        <title>Crush AI — Gallery</title>
        <link rel="canonical" href="https://yourdomain.com/gallery" />
        <meta name="description" content="Browse the SFW gallery for free. Unlock NSFW images by holding $CRUSH or buying per image." />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Crush AI — Gallery (SFW + NSFW)" />
        <meta property="og:description" content="SFW is free. NSFW unlocks by holding $CRUSH or buying per image. Tokens go straight to the treasury." />
        <meta property="og:image" content="https://yourdomain.com/og-gallery.png" />
        <meta property="og:url" content="https://yourdomain.com/gallery" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Crush AI — Gallery (SFW + NSFW)" />
        <meta name="twitter:description" content="Hold $CRUSH to unlock NSFW, or buy access per image." />
        <meta name="twitter:image" content="https://yourdomain.com/og-gallery.png" />
        <meta name="theme-color" content="#fa1a81" />
      </Head>

      <main className="min-h-screen px-4 py-10 flex flex-col items-center">
        <h1 className="text-4xl font-bold text-white title-glow mb-2">Gallery</h1>
        <p className="text-pink-100/90 text-center max-w-2xl">
          SFW is free. NSFW unlocks if you hold <b>{NSFW_HOLD.toLocaleString()}</b> $CRUSH — or buy single images.
        </p>

        {/* Wallet/Gate row */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!wallet ? (
            <button onClick={connectWallet} className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold">
              Connect Phantom
            </button>
          ) : (
            <>
              <div className="px-3 py-2 rounded-xl bg-black/30 border border-pink-300/30 text-sm text-white">
                Wallet: <span className="font-mono">{wallet.slice(0,4)}…{wallet.slice(-4)}</span>
              </div>
              <button onClick={() => refreshHold()} disabled={checking} className="px-3 py-2 rounded-xl bg-pink-500 text-white text-sm font-semibold disabled:opacity-60">
                {checking ? "Checking…" : "Refresh Hold Balance"}
              </button>
              <div className="text-pink-50 text-sm">Your $CRUSH: <b>{hold.toLocaleString()}</b></div>
            </>
          )}
          {err && <div className="text-pink-200 text-sm">{err}</div>}
        </div>

        {/* Tabs */}
        <div className="mt-6 flex items-center gap-2">
          <button className={cx("px-4 py-2 rounded-xl font-semibold", tab==="SFW" ? "bg-pink-600 text-white" : "bg-black/30 border border-pink-300/30 text-pink-100")}
                  onClick={()=>setTab("SFW")}>SFW</button>
          <button className={cx("px-4 py-2 rounded-xl font-semibold", tab==="NSFW" ? "bg-pink-600 text-white" : "bg-black/30 border border-pink-300/30 text-pink-100")}
                  onClick={()=>setTab("NSFW")}>NSFW</button>
          <Link href="/buy" className="ml-2 px-4 py-2 rounded-xl bg-pink-500 text-white font-semibold hover:bg-pink-600">Buy $CRUSH</Link>
        </div>

        {/* Content */}
        <section className="w-full max-w-5xl mt-6">
          {tab === "SFW" ? (
            <Grid images={SFW_IMAGES} mode="SFW" />
          ) : (
            <NSFWGrid
              images={NSFW_IMAGES}
              wallet={wallet}
              owned={owned}
              onBuy={buyImage}
              busyId={busy}
              unlockedGlobally={nsfwUnlockedGlobally}
              canBuy={canBuy}
            />
          )}
        </section>

        <style jsx global>{`
          .title-glow { text-shadow: 0 0 12px #fa1a81bb, 0 0 32px #fff; }
          a:focus-visible, button:focus-visible { outline: 3px solid #b5fffc; outline-offset: 2px; border-radius: 12px; }
          @media (prefers-reduced-motion: reduce) {
            .pulse, .shimmer { animation: none !important; transition: none !important; }
          }
        `}</style>
      </main>
    </>
  );
}

function Grid({ images, mode }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {images.map(img => (
        <figure key={img.id} className="relative rounded-xl overflow-hidden border border-pink-300/30 bg-black/30">
          <img src={img.src} alt={img.title || ""} className="w-full h-44 object-cover" />
          <figcaption className="p-2 text-center text-pink-100 text-sm">{img.title}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function NSFWGrid({ images, wallet, owned, onBuy, busyId, unlockedGlobally, canBuy }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {images.map(img => {
        const unlocked = unlockedGlobally || owned.has(img.id);
        return (
          <figure key={img.id} className="relative rounded-xl overflow-hidden border border-pink-300/30 bg-black/30">
            <img
              src={unlocked ? (img.full || img.src) : img.src}
              alt={img.title || ""}
              className={cx("w-full h-44 object-cover", unlocked ? "" : "blur-sm")}
            />
            <figcaption className="p-2 text-center text-pink-100 text-sm">{img.title}</figcaption>

            {!unlocked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-2">
                <div className="text-white text-sm">🔒 {img.priceCrush} $CRUSH</div>
                <button
                  disabled={!canBuy || busyId === img.id}
                  onClick={() => onBuy(img)}
                  className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {busyId === img.id ? "Processing…" : "Buy access"}
                </button>
                {!wallet && <div className="text-pink-100 text-xs">Connect Phantom above</div>}
              </div>
            )}
          </figure>
        );
      })}
    </div>
  );
}
