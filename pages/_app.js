// pages/_app.js
import "../lib/patches/rpc-redirect"; // <— catch any stray public-RPC calls
import "../styles/globals.css";

import Layout from "../components/Layout";
import dynamic from "next/dynamic";

const SolanaWalletProvider = dynamic(
  () => import("../components/SolanaWalletProvider"),
  { ssr: false }
);

export default function MyApp({ Component, pageProps }) {
  return (
    <SolanaWalletProvider>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </SolanaWalletProvider>
  );
}
