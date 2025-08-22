// /pages/api/og/[id].js
import { ImageResponse } from '@vercel/og';
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-client-info': 'og-edge' } },
});

async function fetchUser(id) {
  // Try wallet exact
  let { data: row } = await supabase
    .from('leaderboard')
    .select('wallet,name,xp')
    .eq('wallet', id)
    .maybeSingle();

  if (!row) {
    // Try name ilike
    const { data } = await supabase
      .from('leaderboard')
      .select('wallet,name,xp')
      .ilike('name', id)
      .limit(1);
    row = data?.[0] || null;
  }
  return row;
}

export default async function handler(req) {
  const { pathname } = new URL(req.url);
  const id = decodeURIComponent(pathname.split('/').pop() || '').trim();
  const user = (await fetchUser(id)) || { wallet: id, name: 'Unknown', xp: 0 };

  // Rank + totals
  const [{ count: higher }, { count: total }] = await Promise.all([
    supabase.from('leaderboard').select('*', { count: 'exact', head: true }).gt('xp', user.xp),
    supabase.from('leaderboard').select('*', { count: 'exact', head: true }),
  ]);
  const rank = (higher ?? 0) + 1;
  const percentile = total ? Math.round(((rank) / total) * 100) : 100;

  const title = user.name || (user.wallet?.slice(0, 4) + '…' + user.wallet?.slice(-4));
  const xpFmt = (user.xp || 0).toLocaleString('en-US');

  // Optional web font
  const inter = await fetch('https://assets.vercel.com/raw/upload/v1607554385/fonts/og-inter.ttf')
    .then(r => r.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          height: '630px',
          width: '1200px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px',
          background:
            'radial-gradient(1200px 600px at 0% 0%, #1a0b24 0%, #0c0d1a 50%, #07060b 100%)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background:
          'conic-gradient(from 120deg at 70% 0%, rgba(181,255,252,0.08), transparent 30%, rgba(255,182,213,0.08) 60%, transparent 85%)' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 16, height: 16, borderRadius: 9999,
            background: 'linear-gradient(90deg,#fa1a81,#b57eff)'
          }} />
          <span style={{ fontSize: 28, color: '#ffe9f6', fontWeight: 800, letterSpacing: .5 }}>
            Crush AI · Leaderboard
          </span>
        </div>

        {/* Middle card */}
        <div style={{
          borderRadius: 24,
          padding: 40,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 30px 80px rgba(181,255,252,0.12), inset 0 0 80px rgba(224,152,248,0.10)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
            <div style={{
              fontSize: 56, fontWeight: 1000, padding: '8px 18px',
              color: '#06121a',
              background: 'radial-gradient(120% 140% at 50% -20%, #b5fffc 0%, #e098f8 70%)',
              border: '2px solid rgba(181,255,252,.9)', borderRadius: 9999,
              textShadow: '0 0 12px rgba(255,255,255,.25)'
            }}>
              #{rank}
            </div>
            <div style={{ fontSize: 42, color: '#fff', fontWeight: 900 }}>{title}</div>
          </div>

          <div style={{ display: 'flex', gap: 26, alignItems: 'center' }}>
            <div style={{ fontSize: 28, color: '#ffd1ec', fontWeight: 800 }}>XP</div>
            <div style={{ fontSize: 48, color: 'white', fontWeight: 1000 }}>{xpFmt}</div>
            <div style={{
              marginLeft: 18, padding: '6px 14px', fontSize: 26, fontWeight: 900,
              color: '#065f46', background: '#10b98122', border: '2px solid #10b98166', borderRadius: 9999
            }}>
              Top {percentile}%
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#b5fffc', fontSize: 24, fontWeight: 800 }}>
            brag: crush.ai/u/{id}
          </div>
          <div style={{ color: '#fff', opacity: .75, fontSize: 22, fontWeight: 700 }}>
            Chat. Flirt. Climb.
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Inter', data: inter, style: 'normal' }],
    }
  );
}
