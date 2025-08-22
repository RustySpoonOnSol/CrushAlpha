// pages/gallery.js — Alpha-friendly (no Supabase required)
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { ALPHA_MODE } from "../utils/alpha";

// keep WalletGate so the page still looks “gated”, but auto-passes in alpha
const WalletGate = dynamic(() => import("../components/WalletGate"), { ssr: false });

const DEMO_ITEMS = [
  { id: "nsfw1", title: "Tease #1", img: "/nsfw1_blurred.png" },
  { id: "nsfw2", title: "Tease #2", img: "/nsfw2_blurred.png" },
];

export default function GalleryPage() {
  const items = useMemo(() => DEMO_ITEMS, []);

  return (
    <>
      <Head>
        <title>Gallery — Crush AI</title>
        <meta name="description" content="Playful previews. Holders unlock more in full release." />
      </Head>

      <div className="min-h-screen px-4 py-10 md:px-8 text-pink-50">
        <h1 className="text-3xl md:text-4xl font-extrabold mb-6">Gallery</h1>

        <WalletGate requireTier="😘 SUPPORTER">
          {ALPHA_MODE && (
            <div className="mb-4 text-sm text-pink-200/80">
              ✅ <b>Alpha mode:</b> Supabase disabled. Showing local preview grid.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((it) => (
              <div key={it.id} className="rounded-2xl overflow-hidden bg-pink-950/30 border border-pink-400/20 shadow-lg">
                <div className="relative w-full aspect-square">
                  <Image src={it.img} alt={it.title} fill className="object-cover" priority />
                </div>
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-pink-100 font-semibold">{it.title}</div>
                    <div className="text-xs text-pink-200/70">Unlock full set in public beta</div>
                  </div>
                  <Link
                    href="/buy"
                    className="px-4 py-2 rounded-xl bg-pink-500 text-white font-bold hover:opacity-90 transition"
                  >
                    Buy $CRUSH
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </WalletGate>
      </div>
    </>
  );
}
