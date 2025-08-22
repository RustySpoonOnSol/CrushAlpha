// components/SolanaWalletProvider.js
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
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

  // Only include the wallets you actually want (Phantom for now)
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
