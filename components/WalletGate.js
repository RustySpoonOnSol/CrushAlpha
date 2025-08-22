// components/WalletGate.js
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { tierFor, formatUI } from "../utils/solanaTokens";
import { ALPHA_BYPASS_WALLET } from "../utils/alpha";
import { useTokenBalance } from "../utils/useTokenBalance";

/**
 * Props:
 * - requireTier: minimum tier string required (matches emoji + label from tierFor)
 * - mint: token mint address (defaults to NEXT_PUBLIC_CRUSH_MINT)
 */
export default function WalletGate({

  // Alpha mode bypass
  if (typeof window !== "undefined" && ALPHA_BYPASS_WALLET) {
    return (
      <div className="w-full rounded-2xl p-4 bg-black/30 border border-pink-300/30 text-center">
        <div className="text-xl text-pink-100 mb-2">✅ Alpha mode: access granted</div>
        {children}
      </div>
    );
  }
  children,
  requireTier = "😘 SUPPORTER",
  mint = process.env.NEXT_PUBLIC_CRUSH_MINT,
}) {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const [status, setStatus] = useState("idle");

  const { amount: balance, loading, refresh } = useTokenBalance({
    connection,
    owner: publicKey,
    mint,
    ttlMs: 60_000,
    debounceMs: 250,
  });
  const tier = tierFor(balance);

  // Tier order based on your thresholds in solanaTokens.js
  const order = ["😶‍🌫️ NEWBIE", "😘 SUPPORTER", "💖 CRUSHED", "🔥 ELITE", "💎 GOD-TIER"];
  const meetsTier = tier ? order.indexOf(tier) >= order.indexOf(requireTier) : false;

  function checkBalance() {
    if (!connected || !publicKey || !mint) return;
    setStatus("checking");
    refresh(true); // force a fresh hit
    setTimeout(() => setStatus("open"), 200);
  }

  useEffect(() => {
    if (connected && publicKey && mint) checkBalance();
  }, [connected, publicKey, mint]); // initial connect

  if (status === "open" && meetsTier) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {connected && tier && !meetsTier ? (
        <div className="text-pink-100 text-center">
          Your tier: <b>{tier}</b> • Balance: {formatUI(balance)} tokens.
          You need <b>{requireTier}</b> to unlock this.
        </div>
      ) : null}

      {!connected ? (
        <button
          className="px-6 py-3 rounded-2xl font-bold text-lg bg-gradient-to-r from-pink-400 to-purple-500 text-white shadow-lg hover:scale-105 transition"
          onClick={() => setVisible(true)}
        >
          🔓 Connect Wallet to Unlock
        </button>
      ) : (
        <button
          className="px-6 py-3 rounded-2xl font-bold text-lg bg-gradient-to-r from-pink-400 to-purple-500 text-white shadow-lg hover:scale-105 transition"
          onClick={checkBalance}
          disabled={loading}
          title={loading ? "Refreshing..." : "Refresh balance"}
        >
          {loading ? "⏳ Checking…" : "🔄 Refresh Balance"}
        </button>
      )}

      {connected && publicKey ? (
        <div className="text-xs text-pink-200/80">
          Connected: {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
        </div>
      ) : null}
    </div>
  );
}
