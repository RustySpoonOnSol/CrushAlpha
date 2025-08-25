// components/SolanaWalletProvider.js
// Uses your Alchemy RPC everywhere and avoids double-registering Phantom.

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

export default function SolanaWalletProvider({ children }) {
  // Prefer browser var, then server fallback, then public RPC as last resort
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC ||
    process.env.SOLANA_RPC_PRIMARY ||
    "https://api.mainnet-beta.solana.com";

  // Do NOT explicitly add Phantom — Wallet Standard auto-registers it.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
