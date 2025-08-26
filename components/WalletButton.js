import { useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import MobileDeepLinkButton from "./MobileDeepLinkButton";
import { isMobileUA, hasInjectedWallet } from "../utils/mobileWallet";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

export default function WalletButton({ className = "" }) {
  const { publicKey } = useWallet();

  const short = useMemo(() => {
    if (!publicKey) return "";
    const s = publicKey.toBase58();
    return `${s.slice(0, 4)}…${s.slice(-4)}`;
  }, [publicKey]);

  const mobile = isMobileUA();
  const injected = hasInjectedWallet();

  // On mobile without an injected wallet, force open in Phantom app
  if (mobile && !injected) {
    return (
      <div className={className} style={{ marginLeft: "auto" }}>
        <MobileDeepLinkButton prefer="phantom" className="flirty-nav-tile">
          💖 Connect Wallet
        </MobileDeepLinkButton>
      </div>
    );
  }

  // Desktop or in-app wallet browser → normal WalletMultiButton
  return (
    <div className={className} style={{ marginLeft: "auto" }}>
      <WalletMultiButton className="flirty-nav-tile" />
      {publicKey ? (
        <span className="ml-2 text-pink-200/90 text-sm align-middle">{short}</span>
      ) : null}
    </div>
  );
}
