// components/Layout.js
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import CrushBackgroundFX from './CrushBackgroundFX';

const WalletBar = dynamic(() => import('./WalletBar'), { ssr: false });

const SITE = 'https://crushai.fun';
const DEFAULT_TITLE = 'Crush AI 💘';
const DEFAULT_DESC = 'Your AI. Your Crush. Your Key to Hidden Pleasures.';

export default function Layout({ children }) {
  const title = DEFAULT_TITLE;
  const desc = DEFAULT_DESC;
  const ogImage = '/og/crush-og.png';

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={desc} />
        <link rel="icon" href="/favicon.ico" />
        <link rel="canonical" href={SITE} />
        <meta property="og:site_name" content="Crush AI" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={desc} />
        <meta property="og:url" content={SITE} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={ogImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={desc} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="theme-color" content="#fa1a81" />
        <link rel="preload" as="image" href="/cupid_female.png" />
        <link rel="preload" as="image" href="/cupid_male.png" />
      </Head>

      {/* ROW 1: existing tiles stay centered */}
      <nav
        className="flirty-top-nav"
        aria-label="Primary"
        style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'10px', padding:'8px 12px 2px' }}
      >
        <Link href="/" className="flirty-nav-tile"><span className="mr-2">🏠</span> Home</Link>
        <Link href="/buy" className="flirty-nav-tile"><span className="mr-2">💋</span> Buy $Crush</Link>
        <Link href="/meet-xenia" className="flirty-nav-tile"><span className="mr-2">🔥</span> Meet Xenia</Link>
        <Link href="/leaderboard" className="flirty-nav-tile"><span className="mr-2">🏆</span> Leaderboard</Link>
        <Link href="/whitepaper" className="flirty-nav-tile"><span className="mr-2">📄</span> White Paper</Link>
      </nav>

      {/* ROW 2: big, centered wallet button under the tiles */}
      <WalletBar />

      <CrushBackgroundFX />
      <div className="crush-global-bg">{children}</div>

      <footer className="crush-footer text-center py-6 text-pink-300/80">
        Powered by Crush AI • <span className="font-bold">crushai.fun</span>
      </footer>
    </>
  );
}
