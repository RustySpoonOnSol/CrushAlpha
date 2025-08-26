import { useEffect, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { WalletConnectWalletAdapter } from "@solana/wallet-adapter-walletconnect";
import "@solana/wallet-adapter-react-ui/styles.css";

export default function SolanaWalletProvider({ children }) {
  // Polyfill Buffer for mobile Safari/Chrome
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && !window.Buffer) {
        window.Buffer = require("buffer").Buffer;
      }
    } catch {}
  }, []);

  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC ||
    process.env.SOLANA_RPC_PRIMARY ||
    "https://api.mainnet-beta.solana.com";

  const wallets = useMemo(() => {
    const arr = [];

    // WalletConnect lets mobile browsers connect to Phantom/Solflare/etc.
    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
    if (projectId) {
      arr.push(
        new WalletConnectWalletAdapter({
          network: "mainnet-beta",
          options: {
            projectId,
            relayUrl: "wss://relay.walletconnect.com",
            metadata: {
              name: "Crush AI",
              description: "Flirty AI on Solana",
              url: process.env.NEXT_PUBLIC_APP_URL || "https://crush-alpha-eight.vercel.app",
              icons: [
                (process.env.NEXT_PUBLIC_APP_URL || "https://crush-alpha-eight.vercel.app") +
                  "/icon-512.png",
              ],
            },
          },
        })
      );
    }

    // Don’t add Phantom adapter explicitly — Wallet Standard will pick it up in in-app browsers.
    return arr;
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
