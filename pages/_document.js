// pages/_document.js
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  const site = "https://yourdomain.com"; // ← TODO: set your domain
  const ogImage = `${site}/og-image.png`; // ← TODO: host a 1200x630 image

  return (
    <Html lang="en">
      <Head>
        {/* Base meta */}
        <meta charSet="utf-8" />
        <meta name="description" content="Crush AI — your flirty AI girlfriend on Solana. Hold $CRUSH to unlock hotter experiences." />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Crush AI — Flirty Chat on Solana" />
        <meta property="og:description" content="Unlock hotter experiences with $CRUSH. Chat with Xenia 💕 and explore token-gated fun." />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={site} />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Crush AI — Flirty Chat on Solana" />
        <meta name="twitter:description" content="Unlock hotter experiences with $CRUSH. Chat with Xenia 💕 and explore token-gated fun." />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:site" content="@CrushAIx" />

        {/* Optional theme color for mobile UI */}
        <meta name="theme-color" content="#fa1a81" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
