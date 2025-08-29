// components/WalletGate.js
// Read-only balance gate. No signatures, no wallet-adapter required.
import { useEffect, useState } from "react";

const MINT = process.env.NEXT_PUBLIC_CRUSH_MINT || "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";
const MIN_HOLD = Number(process.env.NEXT_PUBLIC_MIN_HOLD ?? "500");

async function fetchTier(address) {
  try {
    const r = await fetch(`/api/tier?address=${encodeURIComponent(address)}`);
    if (r.ok) {
      const j = await r.json();
      return Number(j?.uiAmount || 0);
    }
  } catch {}
  const r2 = await fetch(`/api/holdings/verify?owner=${encodeURIComponent(address)}&mint=${encodeURIComponent(MINT)}`);
  const j2 = await r2.json().catch(() => ({}));
  return Number(j2?.amount || 0);
}

export default function WalletGate({ children }) {
  const [addr, setAddr] = useState(null);
  const [amount, setAmount] = useState(0);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("crush_wallet") : null;
    if (stored) {
      setAddr(stored);
      refresh(stored);
    } else if (typeof window !== "undefined" && window.solana?.isPhantom) {
      window.solana.connect({ onlyIfTrusted: true }).then(r => {
        const pk = r?.publicKey?.toString();
        if (pk) {
          setAddr(pk);
          try { localStorage.setItem("crush_wallet", pk); } catch {}
          refresh(pk);
        }
      }).catch(()=>{});
    }
  }, []);

  async function connect() {
    try {
      setErr("");
      if (!window?.solana?.isPhantom) throw new Error("Install Phantom");
      const { publicKey } = await window.solana.connect();
      const pk = publicKey?.toString();
      if (!pk) throw new Error("No public key");
      setAddr(pk);
      try { localStorage.setItem("crush_wallet", pk); } catch {}
      await refresh(pk);
    } catch (e) { setErr(e.message || "Connect failed"); }
  }

  async function disconnect() {
    try { await window?.solana?.disconnect?.(); } catch {}
    setAddr(null); setAmount(0); setErr("");
    try { localStorage.removeItem("crush_wallet"); } catch {}
  }

  async function refresh(pk = addr) {
    if (!pk) return;
    setChecking(true); setErr("");
    try {
      const bal = await fetchTier(pk);
      setAmount(bal);
    } catch { setErr("Balance check failed"); }
    finally { setChecking(false); }
  }

  const isHolder = !!addr && amount >= MIN_HOLD;

  if (!isHolder) {
    return (
      <div className="w-full rounded-2xl p-4 bg-black/30 border border-pink-300/30 text-center">
        <div className="text-xl font-semibold mb-1">🔒 Holders-only content</div>
        <div className="mb-3">Hold at least <b>{MIN_HOLD}</b> $CRUSH to access this.</div>
        <div className="flex items-center justify-center gap-2 mb-2">
          {!addr ? (
            <button onClick={connect} className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold">Connect Phantom</button>
          ) : (
            <>
              <div className="px-3 py-2 rounded-xl bg-black/30 border border-pink-300/30 text-sm">
                <span className="opacity-80">Wallet:</span>{" "}
                <span className="font-mono">{addr.slice(0,4)}…{addr.slice(-4)}</span>
              </div>
              <button onClick={disconnect} className="px-3 py-2 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 text-white text-sm border border-pink-300/40">Disconnect</button>
            </>
          )}
          <button onClick={() => refresh()} disabled={!addr || checking} className="px-4 py-2 rounded-xl bg-pink-500 text-white font-semibold disabled:opacity-60">
            {checking ? "Checking…" : "Refresh"}
          </button>
        </div>
        <div className="text-sm">Your $CRUSH: <b>{amount.toLocaleString()}</b> • Need: <b>{MIN_HOLD}</b></div>
        {err && <div className="mt-2 text-sm text-pink-200/90">{err}</div>}
      </div>
    );
  }

  return <>{children}</>;
}
