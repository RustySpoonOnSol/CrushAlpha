// src/pages/u/[id].js
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

export async function getServerSideProps({ params }) {
  const id = params.id;

  // ✅ Alpha-safe fallback (no Supabase → no crash)
  const HAS_SUPA = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!HAS_SUPA) {
    return { props: { id, user: { wallet: id, name: id, xp: 0 }, rank: 1, percentile: 100 } };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );

  // Resolve user by wallet or name
  let { data: user } = await supabase
    .from('leaderboard')
    .select('wallet,name,xp')
    .eq('wallet', id)
    .maybeSingle();

  if (!user) {
    const { data } = await supabase
      .from('leaderboard')
      .select('wallet,name,xp')
      .ilike('name', id)
      .limit(1);
    user = data?.[0] || null;
  }
  if (!user) user = { wallet: id, name: id, xp: 0 };

  // rank + totals (guarded)
  let higher = 0, total = 0;
  try {
    const [{ count: h }, { count: t }] = await Promise.all([
      supabase.from('leaderboard').select('*', { count: 'exact', head: true }).gt('xp', user.xp),
      supabase.from('leaderboard').select('*', { count: 'exact', head: true }),
    ]);
    higher = h || 0; total = t || 0;
  } catch {}
  const rank = (higher ?? 0) + 1;
  const percentile = total ? Math.round((rank / total) * 100) : 100;

  return { props: { id, user, rank, percentile } };
}

export default function UserShare({ id, user, rank, percentile }) {
  const title =
    user.name || (user.wallet ? user.wallet.slice(0, 4) + '…' + user.wallet.slice(-4) : id);
  const xpFmt = (user.xp || 0).toLocaleString();

  // Absolute URLs for OG/Twitter (set NEXT_PUBLIC_SITE_URL = https://your-domain)
  const base = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const pageUrl = `${base}/u/${encodeURIComponent(id)}`;
  const ogUrl = `${base}/api/og/${encodeURIComponent(id)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      alert('Share link copied!');
    } catch {
      // fallback: open prompt
      prompt('Copy this link:', pageUrl);
    }
  };

  const tweetText = `My Crush AI flirt rank: #${rank} — XP ${xpFmt}`;
  const tweetHref =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(pageUrl)}`;

  return (
    <>
      <Head>
        <title>{title} — Crush AI Leaderboard</title>
        <meta name="description" content="Share your Crush AI flirt rank." />
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`${title} — Crush AI Leaderboard`} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content={ogUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${title} — Crush AI Leaderboard`} />
        <meta name="twitter:image" content={ogUrl} />
        {/* Canonical */}
        {base && <link rel="canonical" href={pageUrl} />}
      </Head>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-4xl font-black mb-4">Crush AI — Leaderboard</h1>

        <div className="rounded-2xl p-6 bg-black/40 border border-pink-300/30">
          <div className="text-xl mb-2 font-semibold">{title}</div>
          <div className="text-pink-100/90">XP: <b>{xpFmt}</b></div>
          <div className="text-pink-100/90">Rank: <b>#{rank}</b></div>
          <div className="text-pink-100/90">Percentile: <b>Top {percentile}%</b></div>

          <div className="mt-6 text-sm text-pink-100/70">
            Share this page or the OG image for social.
          </div>

          {/* Quick share actions */}
          <div className="mt-4 flex gap-3">
            <button
              onClick={copyLink}
              className="px-4 py-2 rounded-xl bg-pink-500/90 hover:bg-pink-500 text-white font-semibold shadow"
            >
              Copy Share Link
            </button>
            <a
              href={tweetHref}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-pink-100 text-pink-700 font-semibold border border-pink-300/60 hover:bg-white/80"
            >
              Share on X
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
