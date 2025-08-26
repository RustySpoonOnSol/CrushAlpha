// components/WalletGate.js
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useTokenBalance } from "../utils/useTokenBalance";
import { tierFor } from "../utils/solanaTokens";
import { ALPHA_BYPASS_WALLET } from "../utils/alpha";
import MobileDeepLinkButton from "./MobileDeepLinkButton";
import { isMobileUA, hasInjectedWallet } from "../utils/mobileWallet";

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
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();

  // Client-side token balance (alpha-ok)
  const { balance, loading } = useTokenBalance(mint);

  if (typeof window !== "undefined" && ALPHA_BYPASS_WALLET) {
    return (
      <div className="w-full rounded-2xl p-4 bg-black/30 border border-pink-300/30 text-center">
        <div className="text-xl text-pink-100 mb-2">✅ Alpha mode: access granted</div>
        {children}
      </div>
    );
  }

  const userTier = tierFor(balance || 0);
  const meetsRequirement = (() => {
    if (!requireTier) return true;
    if (!balance || balance <= 0) return false;
    return true;
  })();

  if (!connected) {
    const mobile = isMobileUA();
    const injected = hasInjectedWallet();

    // On mobile with no provider → force open in wallet app
    if (mobile && !injected) {
      return (
        <div className="w-full rounded-2xl p-6 bg-black/30 border border-pink-300/30 text-center">
          <div className="text-lg mb-3">🔒 Holders-only content</div>
          <MobileDeepLinkButton prefer="phantom" className="px-5 py-2 rounded-xl bg-pink-500 text-white font-bold hover:opacity-90 transition">
            Open in Phantom
          </MobileDeepLinkButton>
        </div>
      );
    }

    // Desktop / in-app browser → open modal
    return (
      <div className="w-full rounded-2xl p-6 bg-black/30 border border-pink-300/30 text-center">
        <div className="text-lg mb-3">🔒 Holders-only content</div>
        <button
          onClick={() => setVisible(true)}
          className="px-5 py-2 rounded-xl bg-pink-500 text-white font-bold hover:opacity-90 transition"
        >
          Connect Wallet
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

  return <>{children}</>;
}
