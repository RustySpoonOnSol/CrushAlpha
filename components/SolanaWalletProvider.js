// components/SolanaWalletProvider.js
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

// Wallet adapter UI styles (modal, buttons, etc.)
import("@solana/wallet-adapter-react-ui/styles.css");

export default function SolanaWalletProvider({ children }) {
  // Prefer explicit public var, then your private fallbacks, then public mainnet
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC ||
    process.env.SOLANA_RPC_PRIMARY ||
    process.env.SOLANA_RPC_FALLBACK ||
    "https://api.mainnet-beta.solana.com";

  // Don't register Phantom explicitly — Wallet Standard auto-registers it.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
