// /pages/u/[id].js
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

export async function getServerSideProps({ params }) {
  const id = params.id;
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
  if (!user) return { notFound: true };

  // rank + totals
  const [{ count: higher }, { count: total }] = await Promise.all([
    supabase.from('leaderboard').select('*', { count: 'exact', head: true }).gt('xp', user.xp),
    supabase.from('leaderboard').select('*', { count: 'exact', head: true }),
  ]);
  const rank = (higher ?? 0) + 1;
  const percentile = total ? Math.round(((rank) / total) * 100) : 100;

  return { props: { id, user, rank, percentile } };
}

export default function UserShare({ id, user, rank, percentile }) {
  const title = user.name || (user.wallet?.slice(0,4) + '…' + user.wallet?.slice(-4));
  const xpFmt = (user.xp || 0).toLocaleString();

  const og = `/api/og/${encodeURIComponent(id)}`;

  return (
    <>
      <Head>
        <title>{title} · Crush AI Leaderboard</title>
        <meta name="description" content={`I'm #${rank} with ${xpFmt} XP on Crush AI — Top ${percentile}%`} />
        <meta property="og:title" content={`${title} · Crush AI Leaderboard`} />
        <meta property="og:description" content={`I'm #${rank} with ${xpFmt} XP — Top ${percentile}%`} />
        <meta property="og:image" content={og} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={og} />
      </Head>

      <main style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: 'radial-gradient(1000px 600px at 0% 0%, #1a0b24 0%, #0c0d1a 50%, #07060b 100%)',
        color: '#fff', padding: 20
      }}>
        <div style={{ textAlign: 'center', maxWidth: 720 }}>
          <img alt="share card" src={og} style={{ width: '100%', borderRadius: 20, border: '1px solid #ffffff33' }} />
          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I'm #${rank} on the Crush AI leaderboard with ${xpFmt} XP — Top ${percentile}% 🔥`)}&url=${encodeURIComponent(`https://yourdomain.com/u/${encodeURIComponent(id)}`)}`}
              target="_blank" rel="noreferrer"
              style={btnStyle}>Share on X</a>
            <a href={og} download={`crush-${id}.png`} style={btnStyle}>Download image</a>
            <button onClick={() => navigator.clipboard.writeText(window.location.href)} style={btnStyle}>Copy link</button>
          </div>
        </div>
      </main>
    </>
  );
}

const btnStyle = {
  padding: '12px 18px',
  borderRadius: 9999,
  border: '1px solid #ffffff44',
  background: 'linear-gradient(90deg,#fa1a81,#b57eff)',
  color: '#fff', fontWeight: 900
};
