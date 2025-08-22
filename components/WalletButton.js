import { useMemo } from "react";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

export default function WalletButton({ className = "" }) {
  const { publicKey } = useWallet();
  const short = useMemo(() => {
    if (!publicKey) return "";
    const s = publicKey.toBase58();
    return `${s.slice(0,4)}…${s.slice(-4)}`;
  }, [publicKey]);

  return (
    <div className={className} style={{ marginLeft: "auto" }}>
      <WalletMultiButton className="flirty-nav-tile" />
      {publicKey ? (
        <span className="ml-2 text-pink-200/90 text-sm align-middle">{short}</span>
      ) : null}
    </div>
  );
}
