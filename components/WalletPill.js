import { useEffect, useState } from "react";

const CRUSH_MINT = process.env.NEXT_PUBLIC_CRUSH_MINT;

export default function WalletPill() {
  const [addr, setAddr] = useState(null);
  const [tier, setTier] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Auto-connect if user previously trusted your site
  useEffect(() => {
    const prov = typeof window !== "undefined" ? window.solana : null;
    if (!prov?.isPhantom) return;
    prov.connect({ onlyIfTrusted: true }).then(({ publicKey }) => {
      if (publicKey) setAddr(publicKey.toBase58());
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let abort = false;
    async function loadTier() {
      if (!addr || !CRUSH_MINT) return;
      setLoading(true); setErr("");
      try {
        // cache for 60s
        const cacheKey = `crush_tier_${addr}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const obj = JSON.parse(cached);
          if (obj.expiresAt && Date.now() < obj.expiresAt) {
            setTier(obj.tier);
            setLoading(false);
            return;
          }
        }
        const res = await fetch(`/api/tier?address=${addr}`);
        if (!res.ok) throw new Error(`Tier check failed (${res.status})`);
        const data = await res.json();
        if (!abort) {
          setTier(data.tier);
          localStorage.setItem(cacheKey, JSON.stringify({
            tier: data.tier, expiresAt: Date.now() + 60_000
          }));
        }
      } catch (e) { if (!abort) setErr(e.message || "Error"); }
      finally { if (!abort) setLoading(false); }
    }
    loadTier();
    return () => { abort = true; };
  }, [addr]);

  async function connect() {
    try {
      const prov = window?.solana;
      if (!prov?.isPhantom) throw new Error("Install Phantom");
      const { publicKey } = await prov.connect();
      setAddr(publicKey?.toBase58() || null);
    } catch (e) { setErr(e.message || "Connect failed"); }
  }

  function short(a){ return a ? `${a.slice(0,4)}…${a.slice(-4)}` : ""; }

  return (
    <div className="fixed right-4 top-4 z-50">
      {!addr ? (
        <button onClick={connect}
          className="px-4 py-2 rounded-xl bg-pink-500 text-white font-semibold hover:bg-pink-500/90">
          Connect Wallet
        </button>
      ) : (
        <div className="px-3 py-2 rounded-xl bg-white/10 text-white border border-white/15 backdrop-blur">
          <div className="text-xs opacity-80">Wallet</div>
          <div className="font-mono">{short(addr)}</div>
          <div className="text-xs mt-1">
            {loading ? "Checking tier…" :
             err ? <span className="text-red-300">{err}</span> :
             tier ? <>Tier <b>{tier.name}</b> • {tier.uiAmount.toLocaleString()} $CRUSH</> :
             "No tier"}
          </div>
        </div>
      )}
    </div>
  );
}
