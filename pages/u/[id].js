// src/pages/u/[id].js
import Head from "next/head";
import { createClient } from "@supabase/supabase-js";

export async function getServerSideProps({ params }) {
  const id = params.id;

  // ✅ Alpha-safe fallback (no Supabase → no crash)
  const HAS_SUPA = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!HAS_SUPA) {
    // minimal SSR data so the page renders and shares correctly
    return {
      props: {
        id,
        user: { wallet: id, name: id, xp: 0 },
        rank: 1,
        percentile: 100,
      },
    };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );

  // Resolve user by wallet or name
  let { data: user } = await supabase
    .from("leaderboard")
    .select("wallet,name,xp")
    .eq("wallet", id)
    .maybeSingle();

  if (!user) {
    const { data } = await supabase
      .from("leaderboard")
      .select("wallet,name,xp")
      .ilike("name", id)
      .limit(1);
    user = data?.[0] || null;
  }
  if (!user) user = { wallet: id, name: id, xp: 0 };

  // rank + totals (guarded)
  let higher = 0,
    total = 0;
  try {
    const [{ count: h }, { count: t }] = await Promise.all([
      supabase
        .from("leaderboard")
        .select("*", { count: "exact", head: true })
        .gt("xp", user.xp),
      supabase
        .from("leaderboard")
        .select("*", { count: "exact", head: true }),
    ]);
    higher = h || 0;
    total = t || 0;
  } catch {}

  const rank = (higher ?? 0) + 1;
  const percentile = total ? Math.round((rank / total) * 100) : 100;

  return { props: { id, user, rank, percentile } };
}

export default function UserShare({ id, user, rank, percentile }) {
  const title =
    user.name ||
    (user.wallet ? user.wallet.slice(0, 4) + "…" + user.wallet.slice(-4) : id);
  const xpFmt = (user.xp || 0).toLocaleString();

  // Absolute base for meta (set NEXT_PUBLIC_SITE_URL in Vercel)
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const pageUrl = base ? `${base}/u/${encodeURIComponent(id)}` : "";

  // Build a matching banner for OG/Twitter using the new /api/x-banner
  const bannerQS = new URLSearchParams({
    name: title,
    xp: String(user.xp || 0),
    rank: String(rank),
    pct: `Top ${percentile}%`,
    bg: `${base}/brand/x-banner.jpg`,
  }).toString();
  const ogImage = base
    ? `${base}/api/x-banner/${encodeURIComponent(id)}?${bannerQS}`
    : `/api/x-banner/${encodeURIComponent(id)}?${bannerQS}`;

  // Also link to the interactive viewer page with buttons
  const viewerUrl = base
    ? `${base}/card/${encodeURIComponent(id)}?${bannerQS}`
    : `/card/${encodeURIComponent(id)}?${bannerQS}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl || window.location.href);
      alert("Share link copied!");
    } catch {
      prompt("Copy this link:", pageUrl || window.location.href);
    }
  };

  const tweetText = `My Crush AI flirt rank: #${rank} — XP ${xpFmt}`;
  const tweetHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    tweetText
  )}&url=${encodeURIComponent(pageUrl || window.location.href)}&hashtags=CrushAI,Solana`;

  return (
    <>
      <Head>
        <title>{title} — Crush AI</title>
        <meta name="description" content="Share your Crush AI flirt rank." />

        {/* Open Graph / Twitter use the same banner */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`${title} — Crush AI`} />
        {pageUrl && <meta property="og:url" content={pageUrl} />}
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1500" />
        <meta property="og:image:height" content="500" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${title} — Crush AI`} />
        <meta name="twitter:image" content={ogImage} />

        {pageUrl && <link rel="canonical" href={pageUrl} />}
        {/* Preload the banner so the above-the-fold preview appears instantly */}
        <link rel="preload" as="image" href={ogImage} />
      </Head>

      <main className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-4xl font-black mb-6">Crush AI — Leaderboard</h1>

        <div className="rounded-2xl p-6 bg-black/40 border border-pink-300/30">
          <div className="text-2xl mb-2 font-extrabold text-white">{title}</div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-pink-100/90">
            <div className="rounded-full px-4 py-2 border border-white/30 bg-white/10 font-black">
              XP: <b className="font-black">{xpFmt}</b>
            </div>
            <div className="rounded-full px-4 py-2 border border-white/30 bg-white/10 font-black">
              Rank: <b className="font-black">#{rank}</b>
            </div>
            <div className="rounded-full px-4 py-2 border border-white/30 bg-white/10 font-black">
              Percentile: <b className="font-black">Top {percentile}%</b>
            </div>
          </div>

          <p className="mt-6 text-sm text-pink-100/80">
            Share this page (or open the social card) and flex your rank.
          </p>

          {/* Share actions */}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={copyLink}
              className="px-4 py-2 rounded-xl bg-pink-500/90 hover:bg-pink-500 text-white font-semibold shadow"
            >
              Copy page link
            </button>

            <a
              href={tweetHref}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-pink-100 text-pink-700 font-semibold border border-pink-300/60 hover:bg-white/80"
            >
              Share on X
            </a>

            <a
              href={viewerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl border border-white/40 text-white hover:bg-white/10 font-semibold"
            >
              Open card
            </a>
          </div>

          {/* Banner preview (nice touch) */}
          <div className="mt-6">
            <img
              src={ogImage}
              alt="Crush AI share banner"
              className="w-full h-auto rounded-xl border border-white/20 shadow-lg"
            />
          </div>
        </div>
      </main>
    </>
  );
}
