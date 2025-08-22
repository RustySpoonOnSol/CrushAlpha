// components/WalletGate.js
import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useTokenBalance } from "../utils/useTokenBalance";
import { tierFor } from "../utils/solanaTokens";
import { ALPHA_BYPASS_WALLET } from "../utils/alpha";

/**
 * Props:
 * - requireTier: minimum tier string required (e.g. "😘 SUPPORTER")
 * - mint: token mint address (defaults to NEXT_PUBLIC_CRUSH_MINT)
 */
export default function WalletGate({
  children,
  requireTier = "😘 SUPPORTER",
  mint = process.env.NEXT_PUBLIC_CRUSH_MINT,
}) {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  // Client-side token balance (safe in alpha; uses RPC when available)
  const { balance, loading } = useTokenBalance(mint);

  // --- ALPHA MODE: auto-pass the gate ---
  if (typeof window !== "undefined" && ALPHA_BYPASS_WALLET) {
    return (
      <div className="w-full rounded-2xl p-4 bg-black/30 border border-pink-300/30 text-center">
        <div className="text-xl text-pink-100 mb-2">✅ Alpha mode: access granted</div>
        {children}
      </div>
    );
  }

  // --- Non-alpha: simple gate logic ---
  // Derive a rough tier from balance and compare. For now, any >0 balance passes "Supporter".
  const userTier = tierFor(balance || 0); // falls back to lowest if unknown
  const meetsRequirement = (() => {
    if (!requireTier) return true;
    if (!balance || balance <= 0) return false;
    // If you want strict tier ordering, implement a rank() using your solanaTokens tiers.
    // For alpha non-bypass we keep it simple: any positive balance satisfies "Supporter".
    return true;
  })();

  if (!connected) {
    return (
      <div className="w-full rounded-2xl p-6 bg-black/30 border border-pink-300/30 text-center">
        <div className="text-lg mb-3">🔒 Holders-only content</div>
        <button
          onClick={() => setVisible(true)}
          className="px-5 py-2 rounded-xl bg-pink-500 text-white font-bold hover:opacity-90 transition"
        >
          Connect Phantom
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full rounded-2xl p-6 bg-black/30 border border-pink-300/30 text-center">
        <div className="animate-pulse text-pink-100">Checking your $CRUSH…</div>
      </div>
    );
  }

  if (!meetsRequirement) {
    return (
      <div className="w-full rounded-2xl p-6 bg-black/30 border border-pink-300/30 text-center">
        <div className="text-lg mb-2">👀 Looks like you’re not a {requireTier} yet</div>
        <a
          href="/buy"
          className="inline-block mt-1 px-5 py-2 rounded-xl bg-pink-500 text-white font-bold hover:opacity-90 transition"
        >
          Buy $CRUSH
        </a>
      </div>
    );
  }

  // Access granted
  return <>{children}</>;
}
