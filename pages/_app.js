// pages/_app.js
import '../styles/globals.css';
import '../lib/patches/rpc-redirect'; // <-- stops public RPC calls in the browser

import Layout from '../components/Layout';
import dynamic from 'next/dynamic';

// Mount Solana providers client-side only (prevents SSR/hydration issues)
const SolanaWalletProvider = dynamic(
  () => import('../components/SolanaWalletProvider'),
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
